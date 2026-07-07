/**
 * Pure business logic for the TECHCOM / Board tracker — the digital version of
 * the SOP's "complete applications awaiting TECHCOM" file.
 *
 * A CommitteeSubmission is created when an application clears the Inspectorate
 * gate (satisfactory pre-authorisation inspection) or is added manually by a
 * Licensing officer. It then walks the SOP's committee path: the MNRS submits
 * it to the Technical Committee (TECHCOM) of the Board; TECHCOM's
 * recommendation goes to the Board for final approval; approval leads to the
 * licence being issued (Form IV, per SOP §1.5), rejection at either stage to a
 * Notice of Rejection (Form III). This module owns the state machine, the
 * audit trail and the summary stats; persistence lives in the store.
 */
import type {
  CommitteeEvent,
  CommitteeStatus,
  CommitteeSubmission,
  InspectionOutcome,
  Province,
  Sector,
} from "./types";

/** Presentation metadata for a committee status (chip + pipeline order). */
export const COMMITTEE_STATUS_META: Record<
  CommitteeStatus,
  { chip: "green" | "amber" | "red" | "slate"; order: number }
> = {
  "Awaiting TECHCOM": { chip: "amber", order: 0 },
  "Awaiting Board": { chip: "amber", order: 1 },
  "Board Approved": { chip: "green", order: 2 },
  "Licence Issued": { chip: "green", order: 3 },
  "Rejected (Form III)": { chip: "red", order: 4 },
  Withdrawn: { chip: "slate", order: 5 },
};

const ACTIVE_STATUSES: CommitteeStatus[] = [
  "Awaiting TECHCOM",
  "Awaiting Board",
  "Board Approved",
];

export function isActiveSubmission(s: CommitteeSubmission): boolean {
  return ACTIVE_STATUSES.includes(s.status);
}

export interface CommitteeActor {
  uid: string;
  name: string;
}

export interface NewCommitteeSubmissionInput {
  ran?: string;
  facilityId: string | null;
  facilityName: string;
  facCode?: string;
  province?: Province | "";
  sector?: Sector | "";
  inspectionRequestId?: string;
  inspectionOutcome?: InspectionOutcome;
  reportRef?: string;
  note?: string;
}

/** Build a new submission (Awaiting TECHCOM) with its opening timeline entry. */
export function buildCommitteeSubmission(
  input: NewCommitteeSubmissionInput,
  actor: CommitteeActor,
  now: string,
): Omit<CommitteeSubmission, "id"> {
  const opening: CommitteeEvent = {
    at: now,
    by: actor.uid,
    byName: actor.name,
    kind: "created",
    status: "Awaiting TECHCOM",
    text: withNote(
      input.inspectionRequestId
        ? "Cleared the pre-authorisation inspection — filed for TECHCOM"
        : "Filed for TECHCOM",
      input.note,
    ),
  };
  return {
    ran: input.ran || undefined,
    facilityId: input.facilityId,
    facilityName: input.facilityName.trim(),
    facCode: input.facCode || "",
    province: input.province || "",
    sector: input.sector || "",
    status: "Awaiting TECHCOM",
    inspectionRequestId: input.inspectionRequestId || undefined,
    inspectionOutcome: input.inspectionOutcome || undefined,
    reportRef: input.reportRef || undefined,
    submittedAt: now,
    submittedBy: actor.uid,
    submittedByName: actor.name,
    timeline: [opening],
    updatedAt: now,
    updatedBy: actor.uid,
  };
}

export type CommitteeAction =
  | { kind: "techcom-approve"; date: string; note?: string }
  | { kind: "board-approve"; date: string; note?: string }
  | { kind: "reject"; date: string; formIIIRef?: string; note?: string }
  | { kind: "issue"; licenceNumber: string; date: string; note?: string }
  | { kind: "withdraw"; reason: string }
  | { kind: "comment"; note: string };

export type CommitteeActionKind = CommitteeAction["kind"];

// Which statuses each action may fire from; `comment` is always allowed.
const ALLOWED_FROM: Record<
  Exclude<CommitteeActionKind, "comment">,
  CommitteeStatus[]
> = {
  "techcom-approve": ["Awaiting TECHCOM"],
  "board-approve": ["Awaiting Board"],
  reject: ["Awaiting TECHCOM", "Awaiting Board"],
  issue: ["Board Approved"],
  withdraw: ["Awaiting TECHCOM", "Awaiting Board", "Board Approved"],
};

export function canApplyCommitteeAction(
  status: CommitteeStatus,
  kind: CommitteeActionKind,
): boolean {
  if (kind === "comment") return true;
  return ALLOWED_FROM[kind].includes(status);
}

/** Actions the current status offers, in display order. */
export function allowedCommitteeActions(
  s: CommitteeSubmission,
): CommitteeActionKind[] {
  const out: CommitteeActionKind[] = [];
  for (const kind of [
    "techcom-approve",
    "board-approve",
    "issue",
    "reject",
    "withdraw",
  ] as const) {
    if (canApplyCommitteeAction(s.status, kind)) out.push(kind);
  }
  out.push("comment");
  return out;
}

/**
 * Apply an action, returning a new submission with the status moved and a
 * timeline entry appended. Throws when the action is invalid from the current
 * status (the UI only offers valid actions; the guard keeps the store honest).
 */
export function applyCommitteeAction(
  submission: CommitteeSubmission,
  action: CommitteeAction,
  actor: CommitteeActor,
  now: string,
): CommitteeSubmission {
  if (!canApplyCommitteeAction(submission.status, action.kind)) {
    throw new Error(
      `Cannot ${action.kind} a submission that is "${submission.status}".`,
    );
  }

  const next: CommitteeSubmission = {
    ...submission,
    timeline: [...submission.timeline],
    updatedAt: now,
    updatedBy: actor.uid,
  };
  const event: CommitteeEvent = {
    at: now,
    by: actor.uid,
    byName: actor.name,
    kind: "comment",
    text: "",
  };

  switch (action.kind) {
    case "techcom-approve": {
      next.status = "Awaiting Board";
      next.techcomDate = action.date;
      event.kind = "techcom-approved";
      event.status = next.status;
      event.text = withNote(
        `TECHCOM recommended approval (${action.date}) — forwarded to the Board`,
        action.note,
      );
      break;
    }
    case "board-approve": {
      next.status = "Board Approved";
      next.boardDate = action.date;
      event.kind = "board-approved";
      event.status = next.status;
      event.text = withNote(
        `Board approved (${action.date}) — issue the licence per SOP §1.5`,
        action.note,
      );
      break;
    }
    case "reject": {
      const stage =
        submission.status === "Awaiting TECHCOM" ? "TECHCOM" : "the Board";
      next.status = "Rejected (Form III)";
      next.formIIIRef = action.formIIIRef?.trim() || undefined;
      if (submission.status === "Awaiting TECHCOM") next.techcomDate = action.date;
      else next.boardDate = action.date;
      event.kind = "rejected";
      event.status = next.status;
      event.text = withNote(
        `Rejected by ${stage} (${action.date}) — issue the Notice of Rejection (Form III)${
          next.formIIIRef ? ` · ${next.formIIIRef}` : ""
        }`,
        action.note,
      );
      break;
    }
    case "issue": {
      const num = action.licenceNumber.trim();
      if (!num) throw new Error("A licence number is required to issue.");
      next.status = "Licence Issued";
      next.licenceNumber = num;
      next.licenceDate = action.date;
      event.kind = "issued";
      event.status = next.status;
      event.text = withNote(
        `Licence issued — ${num} (${action.date})`,
        action.note,
      );
      break;
    }
    case "withdraw": {
      const reason = action.reason.trim();
      next.status = "Withdrawn";
      event.kind = "withdrawn";
      event.status = next.status;
      event.text = `Withdrawn${reason ? ` — ${reason}` : ""}`;
      break;
    }
    case "comment": {
      const note = action.note.trim();
      if (!note) throw new Error("A comment cannot be empty.");
      event.text = note;
      break;
    }
  }

  next.timeline.push(event);
  return next;
}

function withNote(base: string, note?: string): string {
  const n = note?.trim();
  return n ? `${base} — ${n}` : base;
}

export interface CommitteeStats {
  total: number;
  active: number;
  byStatus: Record<CommitteeStatus, number>;
  awaitingTechcom: number;
  issued: number;
  rejected: number;
}

export function committeeStats(subs: CommitteeSubmission[]): CommitteeStats {
  const byStatus = {
    "Awaiting TECHCOM": 0,
    "Awaiting Board": 0,
    "Board Approved": 0,
    "Licence Issued": 0,
    "Rejected (Form III)": 0,
    Withdrawn: 0,
  } as Record<CommitteeStatus, number>;
  let active = 0;
  for (const s of subs) {
    byStatus[s.status] += 1;
    if (isActiveSubmission(s)) active += 1;
  }
  return {
    total: subs.length,
    active,
    byStatus,
    awaitingTechcom: byStatus["Awaiting TECHCOM"],
    issued: byStatus["Licence Issued"],
    rejected: byStatus["Rejected (Form III)"],
  };
}
