"use client";

/**
 * Shared load-failure banner. Pages gate on `!data` while fetching; without
 * this, a Firestore permission/network error left them on "Loading…" forever
 * with no feedback or retry.
 */
export function LoadErrorBanner({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="card bleed p-4 text-sm flex flex-wrap items-center justify-between gap-3"
      style={{ borderLeft: "3px solid var(--status-stalled)" }}
    >
      <span className="min-w-0">
        <span className="chip red mr-2">Load failed</span>
        {error}
      </span>
      <button className="btn btn-secondary" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
