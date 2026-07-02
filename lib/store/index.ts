import { isMockMode } from "../firebase";
import type { DataStore } from "./types";

// Both stores are loaded on demand: the firebase path keeps the mock bundle
// free of firebase imports, and the mock path keeps the ~100 KB facilities
// seed JSON (statically imported by mockStore) out of every page's first-load
// chunk when running against Firebase.
async function loadFirebaseStore(): Promise<DataStore> {
  const mod = await import("./firebaseStore");
  return mod.firebaseStore;
}

async function loadMockStore(): Promise<DataStore> {
  const mod = await import("./mockStore");
  return mod.mockStore;
}

let cached: DataStore | null = null;

export async function store(): Promise<DataStore> {
  if (cached) return cached;
  cached = isMockMode ? await loadMockStore() : await loadFirebaseStore();
  await cached.ready();
  return cached;
}

export async function resetMockStore(): Promise<void> {
  const mod = await import("./mockStore");
  mod.resetMockStore();
}

export type { DataStore } from "./types";
