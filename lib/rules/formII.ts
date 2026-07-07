/**
 * Form II — Request for Further Particulars — tracking.
 *
 * The SOP: when an application is incomplete or an inspection is
 * unsatisfactory, the Licensing Section requests the missing information via
 * Form II and the client has up to 14 days to respond. This module builds the
 * tracked record (with its due date computed in working days), derives its
 * live state (awaiting / due soon / EXPIRED / responded), and summarises the
 * queue. Expired Form IIs are the SOP's candidates for rejection.
 */
import { FURTHER_PARTICULARS_TARGET, DUE_SOON_THRESHOLD } from "./sla";
import { addWorkingDays, workingDaysLeft } from "./workingDays";
import type {
  FurtherParticularsRecord,
  Province,
  Sector,
} from "./types";

export interface FormIIActor {
  uid: string;
  name: string;
}

export interface NewFormIIInput {
  ran?: string;
  facilityId: string | null;
  facilityName: string;
  facCode?: string;
  details: string;
  /** Defaults to today; back-datable for paper Form IIs already sent. */
  issuedDate: string;
}

/** Build a new Form II record with its response due date. */
export function buildFurtherParticulars(
  input: NewFormIIInput,
  actor: FormIIActor,
  now: string,
): Omit<FurtherParticularsRecord, "id"> {
  const details = input.details.trim();
  if (!details) throw new Error("Describe what is being requested.");
  const issuedDate = input.issuedDate;
  return {
    ran: input.ran || undefined,
    facilityId: input.facilityId,
    facilityName: input.facilityName.trim(),
    facCode: input.facCode || "",
    details,
    issuedDate,
    dueDate: addWorkingDays(issuedDate, FURTHER_PARTICULARS_TARGET),
    status: "Awaiting Response",
    createdBy: actor.uid,
    createdByName: actor.name,
    createdAt: now,
    updatedAt: now,
    updatedBy: actor.uid,
  };
}

export type FormIIAction =
  | { kind: "respond"; date: string; note?: string }
  | { kind: "withdraw"; note?: string };

/** Apply a response / withdrawal to a Form II record. */
export function applyFormIIAction(
  rec: FurtherParticularsRecord,
  action: FormIIAction,
  actor: FormIIActor,
  now: string,
): FurtherParticularsRecord {
  if (rec.status !== "Awaiting Response") {
    throw new Error(`This Form II is already ${rec.status}.`);
  }
  if (action.kind === "respond") {
    return {
      ...rec,
      status: "Responded",
      respondedDate: action.date,
      note: action.note?.trim() || undefined,
      updatedAt: now,
      updatedBy: actor.uid,
    };
  }
  return {
    ...rec,
    status: "Withdrawn",
    note: action.note?.trim() || undefined,
    updatedAt: now,
    updatedBy: actor.uid,
  };
}

export type FormIIState =
  | "awaiting"
  | "due-soon"
  | "expired"
  | "responded"
  | "responded-late"
  | "withdrawn";

/** Live state of a Form II record at `todayISO`. Expired is derived. */
export function formIIState(
  rec: FurtherParticularsRecord,
  todayISO: string,
): FormIIState {
  if (rec.status === "Withdrawn") return "withdrawn";
  if (rec.status === "Responded") {
    return (rec.respondedDate || todayISO) <= rec.dueDate
      ? "responded"
      : "responded-late";
  }
  const left = workingDaysLeft(todayISO, rec.dueDate);
  if (left < 0) return "expired";
  if (left <= DUE_SOON_THRESHOLD) return "due-soon";
  return "awaiting";
}

export const FORM_II_STATE_META: Record<
  FormIIState,
  { chip: "green" | "amber" | "red" | "slate"; label: string }
> = {
  awaiting: { chip: "slate", label: "Awaiting response" },
  "due-soon": { chip: "amber", label: "Due soon" },
  expired: { chip: "red", label: "Expired — rejection candidate" },
  responded: { chip: "green", label: "Responded" },
  "responded-late": { chip: "amber", label: "Responded late" },
  withdrawn: { chip: "slate", label: "Withdrawn" },
};

export interface FormIIStats {
  total: number;
  awaiting: number;
  dueSoon: number;
  expired: number;
  responded: number;
}

export function formIIStats(
  records: FurtherParticularsRecord[],
  todayISO: string,
): FormIIStats {
  let awaiting = 0;
  let dueSoon = 0;
  let expired = 0;
  let responded = 0;
  for (const r of records) {
    const st = formIIState(r, todayISO);
    if (st === "awaiting") awaiting++;
    else if (st === "due-soon") dueSoon++;
    else if (st === "expired") expired++;
    else if (st === "responded" || st === "responded-late") responded++;
  }
  return { total: records.length, awaiting: awaiting + dueSoon, dueSoon, expired, responded };
}
