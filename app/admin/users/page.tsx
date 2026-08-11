"use client";

import { useState } from "react";

import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { LoadErrorBanner } from "@/components/LoadError";
import { Panel } from "@/components/Section";
import { useToast } from "@/components/Toast";
import { isMockMode } from "@/lib/firebase";
import {
  ROLES,
  SECTIONS,
  type Role,
  type Section,
} from "@/lib/rules/types";

export default function AdminUsersPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  // Don't fire a (rules-denied) users-collection read for non-admins.
  const { data, loading, error, reload } = useStoreData(
    async (s) => (isAdmin ? s.listUsers() : []),
    [isAdmin],
  );

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("officer");
  const [section, setSection] = useState<Section | "All">(
    "Authorisation & Standards",
  );
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [togglingUid, setTogglingUid] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <Panel>
        <p className="text-sm">Only administrators can manage user accounts.</p>
      </Panel>
    );
  }

  const toggleUser = async (uid: string, disabled: boolean) => {
    setTogglingUid(uid);
    try {
      const s = await store();
      await s.setUserDisabled(uid, disabled);
      reload();
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : "Failed to update the account.",
        "error",
      );
    } finally {
      setTogglingUid(null);
    }
  };

  const add = async () => {
    if (!email.trim() || !displayName.trim()) return;
    if (!isMockMode && password.length < 6) {
      toast.push("Set a temporary password of at least 6 characters.", "error");
      return;
    }
    setBusy(true);
    try {
      const s = await store();
      const { uid } = await s.provisionUser({
        email: email.trim(),
        displayName: displayName.trim(),
        role,
        section,
        password,
      });
      toast.push(
        `User ${email} provisioned (uid ${uid.slice(0, 6)}…).`,
        "success",
      );
      setEmail("");
      setDisplayName("");
      setPassword("");
      reload();
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : "Failed to provision user.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 staggered">
      <Panel
        title="Add staff account"
        note={
          isMockMode
            ? "Demo mode: the account is stored locally — no real sign-in is created."
            : "Creates the Firebase Auth account and sets the role + section custom claims via the setUserClaims Cloud Function. Share the temporary password securely; the user can change it after first sign-in."
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="u-email">
              Email
            </label>
            <input
              id="u-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@rpa.gov.zm"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="u-name">
              Display name
            </label>
            <input
              id="u-name"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="u-role">
              Role
            </label>
            <select
              id="u-role"
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="u-section">
              Section
            </label>
            <select
              id="u-section"
              className="input"
              value={section}
              onChange={(e) => setSection(e.target.value as Section | "All")}
            >
              <option value="All">All</option>
              {SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="field-label" htmlFor="u-password">
              {isMockMode
                ? "Temporary password (ignored in demo mode)"
                : "Temporary password"}
            </label>
            <input
              id="u-password"
              className="input"
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                isMockMode ? "(not required in demo mode)" : "min. 6 characters"
              }
            />
          </div>
        </div>
        <button
          disabled={
            busy ||
            !email.trim() ||
            !displayName.trim() ||
            (!isMockMode && password.length < 6)
          }
          className="btn btn-primary mt-3 w-full sm:w-auto"
          onClick={add}
        >
          {busy ? "Adding…" : "Provision account"}
        </button>
      </Panel>

      {error ? <LoadErrorBanner error={error} onRetry={reload} /> : null}

      <Panel
        title={`Staff accounts (${loading && !data ? "…" : data?.length || 0})`}
        flush
      >
        <div className="hidden md:block table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Section</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(data || []).map((u) => (
                <tr key={u.uid}>
                  <td className="font-bold">{u.displayName}</td>
                  <td className="tabular">{u.email}</td>
                  <td>
                    <span className={`chip ${u.role === "admin" ? "yellow" : ""}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="text-xs">{u.section}</td>
                  <td>
                    {u.disabled ? (
                      <span className="chip red">Disabled</span>
                    ) : (
                      <span className="chip green">Active</span>
                    )}
                  </td>
                  <td className="text-right">
                    <ToggleButton
                      disabled={togglingUid === u.uid}
                      isDisabledAccount={!!u.disabled}
                      onClick={() => toggleUser(u.uid, !u.disabled)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="md:hidden divide-y divide-gunmetal/8">
          {(data || []).map((u) => (
            <li key={u.uid} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold break-words">{u.displayName}</div>
                  <div className="text-xs text-gunmetal/60 break-all">
                    {u.email}
                  </div>
                </div>
                <ToggleButton
                  disabled={togglingUid === u.uid}
                  isDisabledAccount={!!u.disabled}
                  onClick={() => toggleUser(u.uid, !u.disabled)}
                />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <span className={`chip ${u.role === "admin" ? "yellow" : ""}`}>
                  {u.role}
                </span>
                <span className="chip">{u.section}</span>
                {u.disabled ? (
                  <span className="chip red">Disabled</span>
                ) : (
                  <span className="chip green">Active</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function ToggleButton({
  disabled,
  isDisabledAccount,
  onClick,
}: {
  disabled: boolean;
  isDisabledAccount: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="link-action shrink-0"
      style={{
        color: isDisabledAccount
          ? "var(--rpa-green-dark)"
          : "var(--status-stalled)",
      }}
    >
      {isDisabledAccount ? "Enable" : "Disable"}
    </button>
  );
}
