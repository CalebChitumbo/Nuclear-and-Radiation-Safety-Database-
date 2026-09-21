/**
 * What the offline write queue is doing, for the screens that capture from
 * places with no signal.
 *
 * Firestore keeps every write on the device and sends it when it can, and the
 * capture screens no longer wait for the server's answer before clearing the
 * form. That leaves one thing the SDK will not tell the officer: a write it
 * queued that the server later REFUSED — a rule, a revoked account, rules not
 * yet deployed. The SDK rolls the document back silently; this module catches
 * the rejection and keeps it until someone has read it.
 *
 * Pure bookkeeping — no React, no Firestore — so it is testable and the hooks
 * in `lib/storeHooks.ts` only subscribe to it. "Pending" is deliberately NOT
 * counted here: the SDK's queue survives a reload and this module does not,
 * so the number of scans still waiting comes off the live snapshot's
 * `hasPendingWrites` metadata instead (`watchTruckScansFor`).
 */

export interface QueuedWriteFailure {
  id: string;
  /** What the write was, in the officer's words — "ABC 1234 at 09:14". */
  label: string;
  message: string;
  /** ISO time the server's refusal reached the device. */
  at: string;
}

export interface WriteQueueState {
  /** Writes this page has issued that the server has not yet answered. */
  inFlight: number;
  /** Writes the server refused after they were shown as saved, newest first. */
  failures: QueuedWriteFailure[];
}

const MAX_FAILURES = 20;

let state: WriteQueueState = { inFlight: 0, failures: [] };
const listeners = new Set<() => void>();
let seq = 0;

function emit(next: WriteQueueState) {
  state = next;
  for (const l of listeners) l();
}

export function writeQueueState(): WriteQueueState {
  return state;
}

export function subscribeWriteQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Follow a write the caller did not wait for. The promise is Firestore's —
 * it resolves when the server has committed and rejects when it refused —
 * and may settle minutes or hours after the officer moved on.
 */
export function trackWrite(
  label: string,
  write: Promise<unknown>,
  now: () => Date = () => new Date(),
): void {
  emit({ ...state, inFlight: state.inFlight + 1 });
  write.then(
    () => emit({ ...state, inFlight: Math.max(0, state.inFlight - 1) }),
    (err: unknown) => {
      const failure: QueuedWriteFailure = {
        id: `w${++seq}`,
        label,
        message: err instanceof Error ? err.message : String(err),
        at: now().toISOString(),
      };
      emit({
        inFlight: Math.max(0, state.inFlight - 1),
        failures: [failure, ...state.failures].slice(0, MAX_FAILURES),
      });
    },
  );
}

export function dismissWriteFailure(id: string): void {
  if (!state.failures.some((f) => f.id === id)) return;
  emit({ ...state, failures: state.failures.filter((f) => f.id !== id) });
}

/** Test hook — the module is a singleton. */
export function resetWriteQueue(): void {
  emit({ inFlight: 0, failures: [] });
}
