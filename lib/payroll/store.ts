// Browser-local payroll store. Mirrors the mock register store: in-memory state
// backed by localStorage, with a change event so every mounted tab refreshes after
// a write. Self-contained from the Firestore register — wiring these collections
// to Firestore later only means swapping this module out.
import { seedPayroll } from "./seed";
import type { PayrollState } from "./types";

const STORAGE_KEY = "rpa-payroll-v1";
export const PAYROLL_CHANGE_EVENT = "rpa-payroll-change";

let state: PayrollState | null = null;

function freshState(): PayrollState {
  return seedPayroll();
}

function load(): PayrollState {
  if (typeof window === "undefined") return freshState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const s = freshState();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      return s;
    }
    const parsed = JSON.parse(raw) as Partial<PayrollState>;
    // Shallow-merge over a fresh seed so a store written by an older build still
    // gains any collections added since (back-compat, same trick the mock store uses).
    return { ...freshState(), ...parsed } as PayrollState;
  } catch {
    return freshState();
  }
}

function save(s: PayrollState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota — keep the in-memory copy */
  }
}

function dispatchChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PAYROLL_CHANGE_EVENT));
  }
}

export function getPayrollState(): PayrollState {
  if (!state) state = load();
  return state;
}

/** Re-read from disk (used when another browser tab writes the store). */
export function reloadPayrollState(): PayrollState {
  state = load();
  return state;
}

/**
 * Apply an immutable update: clone the current state, let the caller mutate the
 * draft, then persist and broadcast. The clone guarantees a new reference so React
 * re-renders.
 */
export function updatePayroll(mutator: (draft: PayrollState) => void): void {
  const draft = structuredClone(getPayrollState());
  mutator(draft);
  state = draft;
  save(draft);
  dispatchChange();
}

export function resetPayroll(): void {
  state = freshState();
  save(state);
  dispatchChange();
}

let counter = 0;
export function pid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}
