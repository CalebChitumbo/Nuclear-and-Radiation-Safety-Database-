"use client";

import { useState } from "react";

import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
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
  const { data, reload } = useStoreData(async (s) => s.listUsers(), []);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("officer");
  const [section, setSection] = useState<Section | "All">(
    "Authorisation & Standards",
  );
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isAdmin) {
    return (
      <div className="card p-6 text-sm">
        Only administrators can manage user accounts.
      </div>
    );
  }

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
      <div className="card p-5">
        <div className="caps text-xs text-gunmetal/60 mb-3">Add staff account</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="caps text-[10px] text-gunmetal/60">Email</label>
            <input
              className="input mt-1"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@rpa.gov.zm"
            />
          </div>
          <div>
            <label className="caps text-[10px] text-gunmetal/60">
              Display name
            </label>
            <input
              className="input mt-1"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div>
            <label className="caps text-[10px] text-gunmetal/60">Role</label>
            <select
              className="input mt-1"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="caps text-[10px] text-gunmetal/60">Section</label>
            <select
              className="input mt-1"
              value={section}
              onChange={(e) =>
                setSection(e.target.value as Section | "All")
              }
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
            <label className="caps text-[10px] text-gunmetal/60">
              {isMockMode
                ? "Temporary password (ignored in demo mode)"
                : "Temporary password"}
            </label>
            <input
              className="input mt-1"
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
        <div className="mt-3 flex items-center gap-3">
          <button
            disabled={
              busy ||
              !email.trim() ||
              !displayName.trim() ||
              (!isMockMode && password.length < 6)
            }
            className="btn btn-primary"
            onClick={add}
          >
            {busy ? "Adding…" : "Provision account"}
          </button>
          <div className="text-xs text-gunmetal/55">
            {isMockMode
              ? "Demo mode: the account is stored locally — no real sign-in is created."
              : "Creates the Firebase Auth account and sets the role + section custom claims via the setUserClaims Cloud Function. Share the temporary password securely; the user can change it after first sign-in."}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gunmetal/8 font-black">
          Staff accounts ({data?.length || 0})
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs caps text-gunmetal/55">
              <th className="px-5 py-2">Name</th>
              <th className="px-5 py-2">Email</th>
              <th className="px-5 py-2">Role</th>
              <th className="px-5 py-2">Section</th>
              <th className="px-5 py-2">Status</th>
              <th className="px-5 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((u) => (
              <tr key={u.uid} className="border-t border-gunmetal/8">
                <td className="px-5 py-2 font-bold">{u.displayName}</td>
                <td className="px-5 py-2 tabular">{u.email}</td>
                <td className="px-5 py-2">
                  <span
                    className={`chip ${u.role === "admin" ? "yellow" : ""}`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-5 py-2 text-xs">{u.section}</td>
                <td className="px-5 py-2">
                  {u.disabled ? (
                    <span className="chip red">Disabled</span>
                  ) : (
                    <span className="chip green">Active</span>
                  )}
                </td>
                <td className="px-5 py-2 text-right">
                  <button
                    onClick={async () => {
                      const s = await store();
                      await s.setUserDisabled(u.uid, !u.disabled);
                      reload();
                    }}
                    className="text-xs caps font-bold"
                    style={{
                      color: u.disabled
                        ? "var(--rpa-green-dark)"
                        : "var(--status-stalled)",
                    }}
                  >
                    {u.disabled ? "Enable" : "Disable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
