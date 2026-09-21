"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  type Auth,
  connectAuthEmulator,
} from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
  connectFirestoreEmulator,
} from "firebase/firestore";
import {
  getFunctions,
  type Functions,
  connectFunctionsEmulator,
} from "firebase/functions";

export const isMockMode = process.env.NEXT_PUBLIC_USE_MOCK === "1";
export const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "1";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _functions: Functions | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (isMockMode) return null;
  if (!firebaseConfig.apiKey) return null;
  if (_app) return _app;
  _app = getApps()[0] || initializeApp(firebaseConfig);
  return _app;
}

export function getFirebaseAuth(): Auth | null {
  if (isMockMode) return null;
  if (_auth) return _auth;
  const app = getFirebaseApp();
  if (!app) return null;
  _auth = getAuth(app);
  if (useEmulators) {
    try {
      connectAuthEmulator(_auth, "http://localhost:9099", {
        disableWarnings: true,
      });
    } catch {
      /* already connected */
    }
  }
  return _auth;
}

/**
 * Firestore with its write queue and read cache kept on the device.
 *
 * The inland offices capture trucks where there is often no signal. With the
 * persistent cache every write is applied locally at once, survives a reload
 * or a phone restart, and is sent — in order — when the SDK next has a
 * connection; every read falls back to what the device last saw. The capture
 * screens rely on this: they do not wait for the server's answer (see
 * `addTruckScan` and `lib/store/writeQueue.ts`).
 *
 * Multi-tab so two open tabs share one queue rather than one of them running
 * without a cache. Where IndexedDB is not available (a locked-down private
 * window) the SDK falls back to a memory cache on its own — writes still queue
 * while the tab is open, but not across a reload.
 */
function initFirestore(app: FirebaseApp): Firestore {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // Already initialised for this app (a hot reload) — take that instance.
    return getFirestore(app);
  }
}

export function getDb(): Firestore | null {
  if (isMockMode) return null;
  if (_db) return _db;
  const app = getFirebaseApp();
  if (!app) return null;
  _db = initFirestore(app);
  if (useEmulators) {
    try {
      connectFirestoreEmulator(_db, "localhost", 8080);
    } catch {
      /* already connected */
    }
  }
  return _db;
}

export function getFbFunctions(): Functions | null {
  if (isMockMode) return null;
  if (_functions) return _functions;
  const app = getFirebaseApp();
  if (!app) return null;
  // setUserClaims (and the other functions) are deployed to us-central1.
  _functions = getFunctions(app, "us-central1");
  if (useEmulators) {
    try {
      connectFunctionsEmulator(_functions, "localhost", 5001);
    } catch {
      /* already connected */
    }
  }
  return _functions;
}
