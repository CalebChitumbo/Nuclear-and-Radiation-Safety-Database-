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
import { newAccountRequest, type SignupInput } from "./rules/signup";
import type { Role, Section, UserDoc } from "./rules/types";

/**
 * An account that exists but holds nothing yet: someone who has signed up and
 * is waiting on an administrator (or whose account has since been disabled).
 * It is deliberately NOT a `UserDoc` — nothing in the app should be able to
 * mistake it for a signed-in officer.
 */
export interface PendingAccount {
  uid: string;
  email: string;
  /** What the request asked for, once their own account document is read. */
  request: UserDoc | null;
  /** Turned down, or switched off, rather than merely waiting. */
  refused: boolean;
}

interface AuthState {
  /** The signed-in officer. Only ever set for an APPROVED account. */
  user: UserDoc | null;
  /** Signed in, but not approved — the "waiting for approval" screen's subject. */
  pendingAccount: PendingAccount | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Create a sign-in and file the account request that goes with it. */
  signUp: (input: SignupInput) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Re-read the account's claims from the server. An approval changes the
   * account's claims, not this browser's token, so the pending screen offers
   * this rather than making people wait out the token's hour.
   */
  refresh: () => Promise<void>;
  isAdmin: boolean;
  canEditAS: boolean;
  canEditInsp: boolean;
  /**
   * The inland office this account files screening figures against, or null
   * when it may file for any (head office, "All", an administrator).
   */
  postedOffice: string | null;
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

/** Pages a signed-out — or not-yet-approved — visitor is allowed to be on. */
const PUBLIC_ROUTES = ["/login", "/signup"];
const PENDING_ROUTE = "/pending";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDoc | null>(null);
  const [pendingAccount, setPendingAccount] = useState<PendingAccount | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  /**
   * Turn a signed-in Firebase user into either an officer or a pending
   * account. The distinction is the `role` claim: it is only ever minted for an
   * approved, enabled account (onUserDocWrite withholds it otherwise), so an
   * account without one holds no access — and must not be shown any. Defaulting
   * a missing claim to "officer"/"All", as this once did, would have shown a
   * pending account the whole navigation and left Firestore to do the refusing.
   */
  const resolveAccount = useCallback(
    async (fbUser: import("firebase/auth").User) => {
      const tokenResult = await fbUser.getIdTokenResult();
      const role = tokenResult.claims.role as Role | undefined;
      const section = tokenResult.claims.section as Section | "All" | undefined;
      if (!role || !section) {
        // No claims: waiting for approval, refused, or disabled. Their own
        // account document says which — it is the one document the rules let
        // an unapproved account read.
        let request: UserDoc | null = null;
        try {
          const { store } = await import("./store");
          const s = await store();
          request = await s.getUser(fbUser.uid);
        } catch {
          /* unreadable — the screen falls back to a plain "waiting" message */
        }
        setUser(null);
        setPendingAccount({
          uid: fbUser.uid,
          email: fbUser.email || request?.email || "",
          request,
          refused: !!request && !request.pending,
        });
        return;
      }
      setPendingAccount(null);
      setUser({
        uid: fbUser.uid,
        email: fbUser.email || "",
        displayName: fbUser.displayName || fbUser.email || "Officer",
        role,
        section,
        border: (tokenResult.claims.border as string) || undefined,
      });
    },
    [],
  );

  useEffect(() => {
    if (isMockMode) {
      const session = loadMockSession();
      if (session?.pending) {
        setPendingAccount({
          uid: session.uid,
          email: session.email,
          request: session,
          refused: false,
        });
      } else {
        setUser(session);
      }
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
        setPendingAccount(null);
        setLoading(false);
        return;
      }
      await resolveAccount(fbUser);
      setLoading(false);
    });
    return () => unsub();
  }, [resolveAccount]);

  // Route guard. Three states, three homes: signed out belongs on /login (or
  // /signup), an unapproved account on /pending and nowhere else, and an
  // officer anywhere but those.
  useEffect(() => {
    if (loading) return;
    const onPublic = PUBLIC_ROUTES.includes(pathname);
    if (!user && !pendingAccount) {
      if (!onPublic) router.replace("/login");
    } else if (pendingAccount) {
      if (pathname !== PENDING_ROUTE) router.replace(PENDING_ROUTE);
    } else if (onPublic || pathname === PENDING_ROUTE) {
      router.replace("/");
    }
  }, [user, pendingAccount, loading, pathname, router]);

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
      if (match.disabled) {
        throw new Error("That account has been disabled by an administrator.");
      }
      saveMockSession(match);
      if (match.pending) {
        setUser(null);
        setPendingAccount({
          uid: match.uid,
          email: match.email,
          request: match,
          refused: false,
        });
      } else {
        setPendingAccount(null);
        setUser(match);
      }
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase not configured.");
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  /**
   * Sign-up is two writes that must both land: the sign-in itself, and the
   * account request that says who it belongs to. The request is written while
   * signed in as the new account, because that is the only account the rules
   * let it be written by.
   */
  const signUp = useCallback(async (input: SignupInput) => {
    if (isMockMode) {
      const { mockStore } = await import("./store/mockStore");
      const request = newAccountRequest(
        input,
        `req-${Math.random().toString(36).slice(2, 10)}`,
      );
      await mockStore.requestAccount(request);
      saveMockSession(request);
      setUser(null);
      setPendingAccount({
        uid: request.uid,
        email: request.email,
        request,
        refused: false,
      });
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase not configured.");
    const { createUserWithEmailAndPassword, updateProfile } = await import(
      "firebase/auth"
    );
    const cred = await createUserWithEmailAndPassword(
      auth,
      input.email.trim(),
      input.password,
    );
    const request = newAccountRequest(input, cred.user.uid);
    await updateProfile(cred.user, { displayName: request.displayName });
    const { store } = await import("./store");
    const s = await store();
    await s.requestAccount(request);
    setUser(null);
    setPendingAccount({
      uid: request.uid,
      email: request.email,
      request,
      refused: false,
    });
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    setPendingAccount(null);
    if (isMockMode) {
      saveMockSession(null);
      return;
    }
    const auth = getFirebaseAuth();
    if (auth) {
      const { signOut: fbSignOut } = await import("firebase/auth");
      await fbSignOut(auth);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (isMockMode) {
      const session = loadMockSession();
      if (!session) return;
      const { mockStore } = await import("./store/mockStore");
      const fresh = await mockStore.getUser(session.uid);
      if (!fresh) return;
      saveMockSession(fresh);
      if (fresh.pending || fresh.disabled) {
        setUser(null);
        setPendingAccount({
          uid: fresh.uid,
          email: fresh.email,
          request: fresh,
          refused: !fresh.pending,
        });
      } else {
        setPendingAccount(null);
        setUser(fresh);
      }
      return;
    }
    const auth = getFirebaseAuth();
    const fbUser = auth?.currentUser;
    if (!fbUser) return;
    // Force a token mint so an approval granted a minute ago is picked up now
    // rather than whenever the cached token happens to expire.
    await fbUser.getIdToken(true);
    await resolveAccount(fbUser);
  }, [resolveAccount]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      pendingAccount,
      loading,
      signIn,
      signUp,
      signOut,
      refresh,
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
      postedOffice: user?.border || null,
    }),
    [user, pendingAccount, loading, signIn, signUp, signOut, refresh],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/**
 * May this user log/edit entries for the given section? Admins and "All"
 * accounts may act for any section; officers only for their own. Mirrors the
 * canEditAS / canEditInsp flags for the two sections that predate this helper.
 */
export function canEditSection(
  user: UserDoc | null,
  section: Section,
): boolean {
  return (
    !!user &&
    (user.role === "admin" || user.section === "All" || user.section === section)
  );
}
