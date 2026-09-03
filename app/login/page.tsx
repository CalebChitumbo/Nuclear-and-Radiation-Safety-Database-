"use client";

import { useState } from "react";
import Link from "next/link";

import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { isMockMode } from "@/lib/firebase";

const DEMO_ACCOUNTS = [
  { email: "admin@rpa.gov.zm", role: "Administrator" },
  { email: "as.officer@rpa.gov.zm", role: "Authorisation & Standards officer" },
  { email: "inspector@rpa.gov.zm", role: "Inspectorate officer" },
  { email: "nsss@rpa.gov.zm", role: "Nuclear Safety, Security & Safeguards officer" },
  {
    email: "nakonde@rpa.gov.zm",
    role: "Border coordinator — posted to Nakonde, sees the scan log only",
  },
];

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4 py-8 sm:py-12">
      <div className="w-full max-w-md card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <Logo size={56} />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-tight">
              RPA Regulatory System
            </h1>
            <p className="caps text-[10px] text-gunmetal/60">
              Nuclear &amp; Radiation Safety Department
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-6 sm:mt-8 space-y-4">
          <div>
            <label className="field-label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="your.name@rpa.gov.zm"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
            />
          </div>
          {error ? (
            <div role="alert" className="chip red w-full justify-center">
              {error}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {isMockMode ? (
          <div className="mt-6 inset p-4">
            <div className="caps text-[10px] text-gunmetal/60 mb-2">
              Demo accounts (any password)
            </div>
            <div className="space-y-1">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword("demo");
                  }}
                  className="block w-full text-left text-sm hover:underline py-1.5"
                >
                  <span className="font-bold break-all">{a.email}</span>
                  <span className="text-gunmetal/60 block text-xs">
                    {a.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <p className="mt-6 text-[11px] text-gunmetal/55 text-center">
          No account yet?{" "}
          <Link className="link-action" href="/signup">
            Request one
          </Link>{" "}
          — an administrator approves it before you can sign in.
        </p>
      </div>
    </div>
  );
}
