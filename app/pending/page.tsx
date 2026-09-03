"use client";

/**
 * Where an account waits.
 *
 * A requested account can sign in from the moment it is created, but it holds
 * no role and no section until an administrator approves it, so it can read
 * nothing at all. Rather than bounce it around a register full of permission
 * errors, the route guard parks it here and it stays here until the approval
 * lands.
 *
 * Approval changes the account's claims on the server, not the token already in
 * this browser, so the page offers a "Check again" that mints a fresh token
 * instead of leaving the officer to wait out the old one.
 */

import { useState } from "react";

import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";

export default function PendingPage() {
  const { pendingAccount, refresh, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);

  const request = pendingAccount?.request || null;
  const refused = !!pendingAccount?.refused;

  const check = async () => {
    setChecking(true);
    try {
      await refresh();
      // If the approval had landed the guard would have moved us off this page,
      // so reaching here means it has not.
      setChecked(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4 py-8 sm:py-12">
      <div className="w-full max-w-md card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <Logo size={56} />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-tight">
              {refused ? "Account not active" : "Waiting for approval"}
            </h1>
            <p className="caps text-[10px] text-gunmetal/60">
              Nuclear &amp; Radiation Safety Department
            </p>
          </div>
        </div>

        <p className="mt-6 text-sm">
          {refused ? (
            <>
              Your account is not active. Speak to an administrator of the
              Authority if you believe it should be.
            </>
          ) : (
            <>
              Your request is with the administrator. You will be able to sign in
              to the system as soon as it is approved — nothing else is needed
              from you.
            </>
          )}
        </p>

        {request ? (
          <dl className="inset p-4 mt-4 space-y-2 text-sm">
            <Row label="Name" value={request.displayName} />
            <Row label="Email" value={request.email} />
            <Row label="Section" value={request.section} />
            {request.border ? (
              <Row label="Inland office" value={request.border} />
            ) : null}
          </dl>
        ) : (
          <p className="mt-4 text-xs text-gunmetal/60">
            {pendingAccount?.email
              ? `Signed in as ${pendingAccount.email}.`
              : null}
          </p>
        )}

        {checked && !refused ? (
          <p className="mt-4 text-xs text-gunmetal/60">
            Still waiting — the request has not been approved yet.
          </p>
        ) : null}

        <div className="mt-6 flex flex-col sm:flex-row gap-2">
          {refused ? null : (
            <button
              type="button"
              className="btn btn-primary flex-1"
              disabled={checking}
              onClick={check}
            >
              {checking ? "Checking…" : "Check again"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost flex-1"
            onClick={() => signOut()}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="caps text-[10px] text-gunmetal/60 shrink-0 pt-0.5">
        {label}
      </dt>
      <dd className="text-right font-bold break-words">{value}</dd>
    </div>
  );
}
