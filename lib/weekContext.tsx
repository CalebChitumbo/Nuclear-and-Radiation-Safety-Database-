"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { currentWeek } from "./rules/week";
import type { WeekDef } from "./rules/types";
import weeksSeed from "../seed/weeks-2026.seed.json";

interface WeekState {
  weeks: WeekDef[];
  selected: WeekDef;
  setSelected: (w: WeekDef) => void;
}

const Ctx = createContext<WeekState | null>(null);

const STORAGE_KEY = "rpa-week-selected";

export function WeekProvider({ children }: { children: ReactNode }) {
  const weeks = weeksSeed as WeekDef[];
  const [selected, setSelectedState] = useState<WeekDef>(() =>
    currentWeek(weeks, new Date()),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const found = weeks.find((w) => w.label === stored);
        if (found) setSelectedState(found);
      }
    } catch {
      /* ignore */
    }
  }, [weeks]);

  const setSelected = (w: WeekDef) => {
    setSelectedState(w);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, w.label);
      } catch {
        /* ignore */
      }
    }
  };

  const value = useMemo(
    () => ({ weeks, selected, setSelected }),
    [weeks, selected],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWeek(): WeekState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWeek requires <WeekProvider>");
  return ctx;
}
