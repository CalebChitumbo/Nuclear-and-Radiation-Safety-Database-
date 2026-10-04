"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { store } from "./store";
import type { DataStore } from "./store/types";
import {
  subscribeWriteQueue,
  writeQueueState,
  type WriteQueueState,
} from "./store/writeQueue";

/**
 * How long after a load returning to the window does NOT read again.
 *
 * Firestore bills every document a read returns, and on a phone the window
 * regains focus each time the officer comes back from another app — the
 * camera, WhatsApp, a call. Re-reading every screen's data on each of those
 * was most of the Sep 2026 bill. A screen still refreshes on focus once its
 * data is this old, and at once on `reload()` after the user's own change.
 */
export const FOCUS_REFRESH_AFTER_MS = 5 * 60 * 1000;

/**
 * Lightweight subscribe-on-change hook. Re-runs the loader whenever the mock
 * store fires "rpa-store-change" (writes locally). For Firebase mode you would
 * use onSnapshot — this app keeps reads simple by re-fetching on demand and on
 * window focus (at most every FOCUS_REFRESH_AFTER_MS).
 */
export function useStoreData<T>(
  loader: (s: DataStore) => Promise<T>,
  deps: unknown[] = [],
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const loadedAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const s = await store();
      const value = await loader(s);
      if (!cancelled) {
        loadedAt.current = Date.now();
        setData(value);
        setError(null);
        setLoading(false);
      }
    })().catch((e: unknown) => {
      if (cancelled) return;
      // Keep any previously loaded data on screen; report why the refresh failed.
      setError(e instanceof Error ? e.message : "Failed to load data.");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  useEffect(() => {
    const reload = () => setTick((t) => t + 1);
    const onFocus = () => {
      if (Date.now() - loadedAt.current >= FOCUS_REFRESH_AFTER_MS) reload();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("rpa-store-change", reload);
      window.addEventListener("focus", onFocus);
      return () => {
        window.removeEventListener("rpa-store-change", reload);
        window.removeEventListener("focus", onFocus);
      };
    }
  }, []);

  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

// ---------------------------------------------------------------------------
// The offline queue — for screens that write from places with no signal
// ---------------------------------------------------------------------------

const NO_QUEUE: WriteQueueState = { inFlight: 0, failures: [] };

/** Writes the server has refused after they were shown as saved. */
export function useWriteQueue(): WriteQueueState {
  return useSyncExternalStore(
    subscribeWriteQueue,
    writeQueueState,
    () => NO_QUEUE,
  );
}

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/**
 * The browser's own view of the connection. It says "online" whenever there
 * is a network interface up, signal or not, so it can only ever confirm the
 * device is offline — the pending count on the shift log is what says whether
 * the server has actually answered.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
