"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  type Auth,
  connectAuthEmulator,
} from "firebase/auth";
import {
  getFirestore,
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

/**
 * Which Firebase project the app is actually talking to. Surfaced in the
 * permission-denied diagnostics so "I deployed the rules" can be checked
 * against the project the browser is really pointed at — deploying to a
 * different project than the one in `.env.local` looks identical from here.
 */
export const firebaseProjectId = firebaseConfig.projectId || "";

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

export function getDb(): Firestore | null {
  if (isMockMode) return null;
  if (_db) return _db;
  const app = getFirebaseApp();
  if (!app) return null;
  _db = getFirestore(app);
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
