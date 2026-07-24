/**
 * Officer notes & history on a licensing application (LicenceWorkflow).
 *
 * Different officers pick up the same application at different times — one
 * raises the invoice, another is in when the payment email lands, a third
 * fields the applicant's phone call. The notes trail is the shared memory pad
 * on the application: officers append free-text comments ("applicant promised
 * POP by Friday — do not regenerate the invoice"), and the store appends
 * automatic status entries whenever a save changes what the application shows,
 * so whoever opens it next reads the full background — what happened, when,
 * and which officer handled it — without asking around the office.
 *
 * Pure and framework-free; persistence (arrayUnion appends, merge writes)
 * lives in the stores.
 */
import type { RequestActor } from "./inspectionRequests";
import type { LicenceWorkflow, WorkflowNote } from "./types";

export function noteId(): string {
  return `wfn-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * The status label an application currently shows: the canonical RAIS status
 * when known, else the parser's short sub-stage label, else the coarse register
 * stage. This is what history entries compare and record.
 */
export function workflowStatusLabel(w: LicenceWorkflow): string {
  return w.currentStatus || w.stage || w.facilityStage || w.notificationTitle || "";
}

/** Build an officer comment. Throws on empty text so the store stays honest. */
export function buildWorkflowComment(
  text: string,
  actor: RequestActor,
  now: string,
  id: string = noteId(),
): WorkflowNote {
  const t = text.trim();
  if (!t) throw new Error("A note cannot be empty.");
  return {
    id,
    at: now,
    by: actor.uid,
    byName: actor.name,
    bySection: actor.section,
    kind: "comment",
    text: t,
  };
}

/**
 * The automatic history entries one save of an application produces, given the
 * previously stored record (if any). At most one status entry — first tracking,
 * a status move, or an accepted incoming email — plus a classification entry
 * when the officer's FORM-I licence-type choice is set/changed on this save.
 * Returns [] when nothing visible changed, so re-pasting the same dashboard
 * adds no noise.
 */
export function workflowHistoryOnSave(
  prev: LicenceWorkflow | undefined | null,
  next: LicenceWorkflow,
  actor: RequestActor,
  now: string,
  mkId: () => string = noteId,
): WorkflowNote[] {
  const out: WorkflowNote[] = [];
  const base = {
    at: now,
    by: actor.uid,
    byName: actor.name,
    bySection: actor.section,
    kind: "status" as const,
    source: next.source,
  };
  const label = workflowStatusLabel(next);

  if (!prev) {
    out.push({
      ...base,
      id: mkId(),
      status: label,
      text: `Application tracked — ${label}`,
    });
  } else if (label && label !== workflowStatusLabel(prev)) {
    out.push({
      ...base,
      id: mkId(),
      status: label,
      text: `Status updated — ${label}`,
    });
  } else if (
    prev.reviewStatus === "needs-review" &&
    next.reviewStatus === "applied"
  ) {
    // The officer accepted an incoming email that didn't move the status —
    // still worth a line: it says who confirmed it and when.
    out.push({
      ...base,
      id: mkId(),
      status: label,
      text: `Incoming update accepted — ${label}`,
    });
  }

  if (next.officerType && next.officerType !== prev?.officerType) {
    out.push({
      ...base,
      id: mkId(),
      text: `Licence type classified — ${next.officerType}`,
    });
  }

  return out;
}

/** The trail in display order (oldest first — the UI reverses for newest-first). */
export function sortedNotes(w: LicenceWorkflow): WorkflowNote[] {
  return [...(w.notes || [])].sort((a, b) => a.at.localeCompare(b.at));
}

/** How many officer comments (not automatic status lines) the trail holds. */
export function workflowCommentCount(w: LicenceWorkflow): number {
  return (w.notes || []).filter((n) => n.kind === "comment").length;
}

/** The most recent officer comment, or null — for badges and summaries. */
export function latestWorkflowComment(w: LicenceWorkflow): WorkflowNote | null {
  const comments = sortedNotes(w).filter((n) => n.kind === "comment");
  return comments.length ? comments[comments.length - 1] : null;
}
