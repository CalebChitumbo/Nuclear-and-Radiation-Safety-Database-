/**
 * The Form I completeness checklist — the SOP's list of attachments a new
 * application must carry before it counts as COMPLETE. "Complete application
 * received" is the event that starts the 44-working-day licence clock, so the
 * checklist turns it into a recorded, dated fact instead of a memory.
 */
import type { LicenceWorkflow } from "./types";

export interface ChecklistItem {
  id: string;
  label: string;
  /** Items marked optional don't block completeness (context-dependent). */
  optional?: boolean;
}

/** SOP §1.2 — attachments to a completed Form I. */
export const FORM_I_CHECKLIST: ChecklistItem[] = [
  { id: "form-i", label: "Completed application form (Form I)" },
  { id: "pacra", label: "Certificate of incorporation (PACRA)" },
  { id: "workers", label: "List of occupationally exposed workers" },
  { id: "sources", label: "Technical details of radiation sources" },
  { id: "rpo", label: "RPO appointment letter" },
  { id: "training", label: "Proof of radiation safety training" },
  { id: "layout", label: "Premises layout plan" },
  { id: "rpsp", label: "Radiation protection & safety programme" },
  { id: "disposal", label: "Disposal agreement", optional: true },
  { id: "leak-test", label: "Leak-test certificate", optional: true },
  { id: "payment", label: "Proof of payment of fees" },
];

/** Required item ids (the ones completeness is judged on). */
export const REQUIRED_CHECKLIST_IDS = FORM_I_CHECKLIST.filter(
  (i) => !i.optional,
).map((i) => i.id);

/** Every required attachment ticked? */
export function checklistComplete(
  checklist: Record<string, boolean> | undefined,
): boolean {
  if (!checklist) return false;
  return REQUIRED_CHECKLIST_IDS.every((id) => checklist[id]);
}

/** received / required counts for a progress caption ("7 of 9"). */
export function checklistProgress(
  checklist: Record<string, boolean> | undefined,
): { received: number; required: number } {
  const received = REQUIRED_CHECKLIST_IDS.filter((id) => checklist?.[id]).length;
  return { received, required: REQUIRED_CHECKLIST_IDS.length };
}

/**
 * The patch to persist when an officer saves a checklist: the ticks plus the
 * completeness date — stamped `today` the first time every required item is
 * ticked, kept once set, and cleared again if the checklist stops being
 * complete (an un-tick after a mistaken stamp).
 */
export function checklistPatch(
  workflow: Pick<LicenceWorkflow, "completeReceivedAt">,
  checklist: Record<string, boolean>,
  todayISO: string,
): Pick<LicenceWorkflow, "checklist" | "completeReceivedAt"> {
  const complete = checklistComplete(checklist);
  return {
    checklist,
    completeReceivedAt: complete
      ? workflow.completeReceivedAt || todayISO
      : undefined,
  };
}
