"use client";

/**
 * User management — the approval desk.
 *
 * Officers ask for their own accounts on the sign-up form; this is where those
 * requests are read and granted. A request arrives as an ordinary officer of
 * one section (and, for NSSS, one inland office), but nothing about it is
 * binding: an administrator settles the role, the section and the office before
 * approving, because approving is what mints the account's claims.
 *
 * Provisioning an account outright is still here — it is the path for someone
 * who cannot sign up themselves, and the one way to create an administrator.
 */

import { useState } from "react";

import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { LoadErrorBanner } from "@/components/LoadError";
import { Panel } from "@/components/Section";
import { useToast } from "@/components/Toast";
import { isMockMode } from "@/lib/firebase";
import {
  officeOptions,
  pendingRequests,
  requiresInlandOffice,
  settledAccounts,
} from "@/lib/rules/signup";
import {
  ROLES,
  SECTIONS,
  type Border,
  type Role,
  type Section,
  type UserDoc,
} from "@/lib/rules/types";

export default function AdminUsersPage() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  // Don't fire a (rules-denied) users-collection read for non-admins.
  const { data, loading, error, reload } = useStoreData(
    async (s) => {
      if (!isAdmin) return { users: [] as UserDoc[], borders: [] as Border[] };
      const [users, borders] = await Promise.all([
        s.listUsers(),
        s.listBorders().catch(() => [] as Border[]),
      ]);
      return { users, borders };
    },
    [isAdmin],
  );

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("officer");
  const [section, setSection] = useState<Section | "All">(
    "Authorisation & Standards",
  );
  const [border, setBorder] = useState("");
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

  const users = data?.users || [];
  const requests = pendingRequests(users);
  const accounts = settledAccounts(users);
  const offices = officeOptions((data?.borders || []).map((b) => b.name));

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
    if (requiresInlandOffice(section) && !border.trim()) {
      toast.push("Name the inland office this officer is posted to.", "error");
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
        border: border.trim(),
        actorUid: user?.uid || "",
      });
      toast.push(
        `User ${email} provisioned (uid ${uid.slice(0, 6)}…).`,
        "success",
      );
      setEmail("");
      setDisplayName("");
      setPassword("");
      setBorder("");
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
        title={`Account requests (${loading && !data ? "…" : requests.length})`}
        note={
          requests.length
            ? "Each request holds no access until it is approved. Check the section — and, for NSSS, the inland office the officer will log against — before granting it."
            : undefined
        }
      >
        {requests.length === 0 ? (
          <p className="text-sm text-gunmetal/60">
            Nothing waiting. Officers ask for accounts on the sign-up page and
            they appear here.
          </p>
        ) : (
          <ul className="space-y-3">
            {requests.map((r) => (
              <RequestCard
                key={r.uid}
                request={r}
                offices={offices}
                actorUid={user?.uid || ""}
                onDone={reload}
              />
            ))}
          </ul>
        )}
      </Panel>

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
          {requiresInlandOffice(section) ? (
            <div className="md:col-span-2">
              <label className="field-label" htmlFor="u-office">
                Inland office
              </label>
              <input
                id="u-office"
                className="input"
                list="rpa-offices"
                value={border}
                onChange={(e) => setBorder(e.target.value)}
                placeholder="e.g. Nakonde"
              />
              <p className="text-[11px] text-gunmetal/60 mt-1.5">
                This officer will only be able to file screening figures against
                this office. An office not yet in the register is added.
              </p>
            </div>
          ) : null}
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
            (requiresInlandOffice(section) && !border.trim()) ||
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
        title={`Staff accounts (${loading && !data ? "…" : accounts.length})`}
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
                <th>Inland office</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((u) => (
                <tr key={u.uid}>
                  <td className="font-bold">{u.displayName}</td>
                  <td className="tabular">{u.email}</td>
                  <td>
                    <span className={`chip ${u.role === "admin" ? "yellow" : ""}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="text-xs">{u.section}</td>
                  <td className="text-xs">{u.border || "—"}</td>
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
          {accounts.map((u) => (
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
                {u.border ? <span className="chip slate">{u.border}</span> : null}
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

      {/* Shared by the request cards and the provisioning form. */}
      <datalist id="rpa-offices">
        {offices.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}

/**
 * One account request, with the three things approval settles: the role, the
 * section, and — for NSSS — the inland office the officer's figures will be
 * filed against. Pre-filled with what was asked for, so the common case is one
 * button.
 */
function RequestCard({
  request,
  offices,
  actorUid,
  onDone,
}: {
  request: UserDoc;
  offices: string[];
  actorUid: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const [role, setRole] = useState<Role>(request.role);
  const [section, setSection] = useState<Section | "All">(request.section);
  const [border, setBorder] = useState(request.border || "");
  const [busy, setBusy] = useState(false);

  const needsOffice = requiresInlandOffice(section);

  const decide = async (approve: boolean) => {
    if (approve && needsOffice && !border.trim()) {
      toast.push("Name the inland office before approving.", "error");
      return;
    }
    setBusy(true);
    try {
      const s = await store();
      if (approve) {
        await s.approveUser(
          request.uid,
          { role, section, border: border.trim() },
          actorUid,
        );
        toast.push(`${request.displayName} can now sign in.`, "success");
      } else {
        await s.declineUser(request.uid);
        toast.push(`${request.displayName}'s request was declined.`, "success");
      }
      onDone();
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : "Could not action the request.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="inset p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="font-black break-words">{request.displayName}</div>
          <div className="text-xs text-gunmetal/60 break-all">
            {request.email}
          </div>
        </div>
        {request.requestedAt ? (
          <div className="caps text-[10px] text-gunmetal/55">
            Asked {request.requestedAt.slice(0, 10)}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        <div>
          <label className="field-label" htmlFor={`role-${request.uid}`}>
            Role
          </label>
          <select
            id={`role-${request.uid}`}
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
          <label className="field-label" htmlFor={`section-${request.uid}`}>
            Section
          </label>
          <select
            id={`section-${request.uid}`}
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
        {needsOffice ? (
          <div>
            <label className="field-label" htmlFor={`office-${request.uid}`}>
              Inland office
            </label>
            <input
              id={`office-${request.uid}`}
              className="input"
              list="rpa-offices"
              value={border}
              onChange={(e) => setBorder(e.target.value)}
              placeholder="e.g. Nakonde"
            />
            {border.trim() &&
            !offices.some(
              (o) => o.toLowerCase() === border.trim().toLowerCase(),
            ) ? (
              <p className="text-[11px] text-gunmetal/60 mt-1.5">
                New office — approving registers it.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => decide(true)}
        >
          {busy ? "Working…" : "Approve"}
        </button>
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => decide(false)}
        >
          Decline
        </button>
      </div>
    </li>
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
