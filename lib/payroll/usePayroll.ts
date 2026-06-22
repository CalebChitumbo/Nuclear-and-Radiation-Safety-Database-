"use client";

import { useCallback, useEffect, useState } from "react";

import {
  PAYROLL_CHANGE_EVENT,
  getPayrollState,
  reloadPayrollState,
  updatePayroll,
} from "./store";
import type { PayrollState } from "./types";

/**
 * Read the payroll store and subscribe to changes. State is `null` until the
 * first client-side effect runs, which keeps localStorage out of the server render
 * (no hydration mismatch). `update` mutates a draft and persists it.
 */
export function usePayroll(): {
  state: PayrollState | null;
  update: (mutator: (draft: PayrollState) => void) => void;
} {
  const [state, setState] = useState<PayrollState | null>(null);

  useEffect(() => {
    setState(getPayrollState());
    const onChange = () => setState(getPayrollState());
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === "rpa-payroll-v1") setState(reloadPayrollState());
    };
    window.addEventListener(PAYROLL_CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PAYROLL_CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback(
    (mutator: (draft: PayrollState) => void) => updatePayroll(mutator),
    [],
  );

  return { state, update };
}
