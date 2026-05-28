import { isMockMode } from "../firebase";
import { mockStore } from "./mockStore";
import type { DataStore } from "./types";

// Firebase store is implemented in firebaseStore.ts but only loaded on demand
// to keep the mock path bundle-free of firebase imports.
async function loadFirebaseStore(): Promise<DataStore> {
  const mod = await import("./firebaseStore");
  return mod.firebaseStore;
}

let cached: DataStore | null = null;

export async function store(): Promise<DataStore> {
  if (cached) return cached;
  if (isMockMode) {
    cached = mockStore;
  } else {
    cached = await loadFirebaseStore();
  }
  await cached.ready();
  return cached;
}

export { mockStore };
export { resetMockStore } from "./mockStore";
export type { DataStore } from "./types";
