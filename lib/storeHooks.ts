"use client";

import { useEffect, useState } from "react";
import { store } from "./store";
import type { DataStore } from "./store/types";

/**
 * Lightweight subscribe-on-change hook. Re-runs the loader whenever the mock
 * store fires "rpa-store-change" (writes locally). For Firebase mode you would
 * use onSnapshot — this app keeps reads simple by re-fetching on demand and on
 * window focus.
 */
export function useStoreData<T>(
  loader: (s: DataStore) => Promise<T>,
  deps: unknown[] = [],
): { data: T | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const s = await store();
      const value = await loader(s);
      if (!cancelled) {
        setData(value);
        setLoading(false);
      }
    })().catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  useEffect(() => {
    const reload = () => setTick((t) => t + 1);
    if (typeof window !== "undefined") {
      window.addEventListener("rpa-store-change", reload);
      window.addEventListener("focus", reload);
      return () => {
        window.removeEventListener("rpa-store-change", reload);
        window.removeEventListener("focus", reload);
      };
    }
  }, []);

  return { data, loading, reload: () => setTick((t) => t + 1) };
}
