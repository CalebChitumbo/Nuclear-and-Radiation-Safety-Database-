"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";

import { getFirebaseAuth, isMockMode } from "./firebase";
import type { Role, Section, UserDoc } from "./rules/types";

interface AuthState {
  user: UserDoc | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  canEditAS: boolean;
  canEditInsp: boolean;
}

const AuthCtx = createContext<AuthState | null>(null);

const MOCK_SESSION_KEY = "rpa-mock-session";

function loadMockSession(): UserDoc | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MOCK_SESSION_KEY);
    return raw ? (JSON.parse(raw) as UserDoc) : null;
  } catch {
    return null;
  }
}

function saveMockSession(u: UserDoc | null) {
  if (typeof window === "undefined") return;
  if (u) window.localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(u));
  else window.localStorage.removeItem(MOCK_SESSION_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isMockMode) {
      setUser(loadMockSession());
      setLoading(false);
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = auth.onAuthStateChanged(async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      const tokenResult = await fbUser.getIdTokenResult();
      const role = (tokenResult.claims.role as Role) || "officer";
      const section =
        (tokenResult.claims.section as Section | "All") || "All";
      setUser({
        uid: fbUser.uid,
        email: fbUser.email || "",
        displayName: fbUser.displayName || fbUser.email || "Officer",
        role,
        section,
      });
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Route guard: bounce to /login if not signed in (except on /login itself).
  useEffect(() => {
    if (loading) return;
    if (!user && pathname !== "/login") {
      router.replace("/login");
    } else if (user && pathname === "/login") {
      router.replace("/");
    }
  }, [user, loading, pathname, router]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (isMockMode) {
      const { mockStore } = await import("./store/mockStore");
      const users = await mockStore.listUsers();
      const match = users.find(
        (u) => u.email.toLowerCase() === email.toLowerCase(),
      );
      if (!match) throw new Error("No account for that email.");
      // For mock mode, any non-empty password works; this is a demo.
      if (!password) throw new Error("Password required.");
      saveMockSession(match);
      setUser(match);
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase not configured.");
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signOut = useCallback(async () => {
    if (isMockMode) {
      saveMockSession(null);
      setUser(null);
      return;
    }
    const auth = getFirebaseAuth();
    if (auth) {
      const { signOut: fbSignOut } = await import("firebase/auth");
      await fbSignOut(auth);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      signIn,
      signOut,
      isAdmin: user?.role === "admin",
      canEditAS:
        !!user &&
        (user.role === "admin" ||
          user.section === "All" ||
          user.section === "Authorisation & Standards"),
      canEditInsp:
        !!user &&
        (user.role === "admin" ||
          user.section === "All" ||
          user.section === "Inspectorate"),
    }),
    [user, loading, signIn, signOut],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
