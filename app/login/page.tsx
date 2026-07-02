"use client";

import { useState } from "react";

import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { isMockMode } from "@/lib/firebase";

const DEMO_ACCOUNTS = [
  { email: "admin@rpa.gov.zm", role: "Administrator" },
  { email: "as.officer@rpa.gov.zm", role: "Authorisation & Standards officer" },
  { email: "inspector@rpa.gov.zm", role: "Inspectorate officer" },
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
    <div
      className="min-h-screen flex items-center justify-center bg-canvas px-4 py-10"
      style={{ backgroundColor: "#F7F4EC" }}
    >
      <div className="w-full max-w-md card p-8">
        <div className="flex items-center gap-3">
          <Logo size={64} />
          <div>
            <h1 className="text-2xl font-black tracking-tight">
              RPA Regulatory System
            </h1>
            <p className="caps text-[10px] text-gunmetal/60">
              Nuclear &amp; Radiation Safety Department
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="caps text-[10px] text-gunmetal/60">Email</label>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input mt-1"
              placeholder="your.name@rpa.gov.zm"
            />
          </div>
          <div>
            <label className="caps text-[10px] text-gunmetal/60">Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input mt-1"
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
          <div className="mt-6 p-4 rounded-lg bg-mist border border-gunmetal/10">
            <div className="caps text-[10px] text-gunmetal/60 mb-2">
              Demo accounts (any password)
            </div>
            <div className="space-y-1.5">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword("demo");
                  }}
                  className="block w-full text-left text-sm hover:underline"
                >
                  <span className="font-bold">{a.email}</span>
                  <span className="text-gunmetal/60 ml-2 text-xs">{a.role}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <p className="mt-6 text-[11px] text-gunmetal/55 text-center">
          Accounts are provisioned by the Authority. Contact your administrator
          for access.
        </p>
      </div>
    </div>
  );
}
