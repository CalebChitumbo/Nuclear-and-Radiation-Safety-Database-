import { detectType } from "./detectType";
import { norm } from "./matching";
import { weekLabelForDate } from "./week";
import {
  type Facility,
  type LicenceEvent,
  type LicenceType,
  type Province,
  type Sector,
  type Stage,
  type WeekDef,
  isUseP,
} from "./types";

export interface RecordLicenceInput {
  facility: Facility | null;            // null when creating a new facility
  newFacilityDraft?: Partial<Facility>; // required when facility is null
  number: string;                       // AUTH number (may be "")
  type?: LicenceType;                   // overrides detection if supplied
  defaultType?: LicenceType;            // fallback for detection
  date: string;                         // ISO date
  weeks: WeekDef[];
  uid: string;
  newFacilityId?: string;               // pre-generated id for the new facility
  newEventId?: string;                  // pre-generated id for the event
}

export interface RecordLicenceMutation {
  facilityWrite: Facility;
  event: LicenceEvent;
  effect:
    | "becomes-licensed"
    | "renewal-logged"
    | "authorisation-only"
    | "new-licensed"
    | "new-import-only"
    | "new-unlicensed";
}

/**
 * Apply R1–R6 to produce the (single) facility write + (single) licence event
 * that result from recording one licence. Pure — no I/O. Callers wrap multiple
 * mutations in a Firestore batch.
 */
export function recordLicence(input: RecordLicenceInput): RecordLicenceMutation {
  const fallback: LicenceType =
    input.defaultType || "New Use/Possession Licence";
  const type: LicenceType =
    input.type || detectType(input.number, fallback);
  const week = weekLabelForDate(input.date, input.weeks, "");
  const number = (input.number || "").trim();
  const now = new Date().toISOString();

  if (input.facility) {
    const f = input.facility;
    const facilityWrite: Facility = {
      ...f,
      auths: [
        ...(f.auths || []),
        {
          type,
          number,
          date: input.date,
          eventId: input.newEventId,
        },
      ],
      updatedAt: now,
      updatedBy: input.uid,
    };

    let effect: RecordLicenceMutation["effect"] = "authorisation-only";
    if (isUseP(type)) {
      if (!f.licensed) {
        facilityWrite.licensed = true;
        facilityWrite.stage = "Licensed";
        effect = "becomes-licensed";
      } else {
        effect = "renewal-logged";
      }
    }

    const event: LicenceEvent = {
      id: input.newEventId || "",
      date: input.date,
      week,
      facilityId: f.id,
      facilityName: f.name,
      sector: f.sector,
      province: f.province,
      type,
      number,
      facCode: f.facCode || "",
      createdAt: now,
      updatedAt: now,
      updatedBy: input.uid,
    };
    return { facilityWrite, event, effect };
  }

  // No matched facility -> create new (R5)
  const d = input.newFacilityDraft || {};
  const baseName = (d.name || "").trim();
  const sector: Sector = (d.sector as Sector) || "Private";
  const province: Province = (d.province as Province) || "Lusaka";
  const district = d.district || "";
  const practice = d.practice || "";
  const facCode = d.facCode || "";

  let licensed = false;
  let stage: Stage = "No Application Submitted";
  let effect: RecordLicenceMutation["effect"] = "new-unlicensed";

  if (isUseP(type)) {
    licensed = true;
    stage = "Licensed";
    effect = "new-licensed";
  } else if (type === "Importation Licence") {
    licensed = false;
    stage = "Import Licence Only (Not yet Use/Possession)";
    effect = "new-import-only";
  }

  const newId = input.newFacilityId || "";
  const facilityWrite: Facility = {
    id: newId,
    no: d.no || 0,
    name: baseName,
    nameLower: norm(baseName),
    district,
    province,
    practice,
    sector,
    licensed,
    stage,
    facCode,
    auths: [
      {
        type,
        number,
        date: input.date,
        eventId: input.newEventId,
      },
    ],
    updatedAt: now,
    updatedBy: input.uid,
  };

  const event: LicenceEvent = {
    id: input.newEventId || "",
    date: input.date,
    week,
    facilityId: newId,
    facilityName: baseName,
    sector,
    province,
    type,
    number,
    facCode,
    createdAt: now,
    updatedAt: now,
    updatedBy: input.uid,
  };

  return { facilityWrite, event, effect };
}

/**
 * R6 — a direct status toggle in the register does NOT create a licence event
 * or an authorisation entry; it only flips state.
 */
export function applyStatusOverride(
  facility: Facility,
  patch: { licensed?: boolean; stage?: Stage },
  uid: string,
): Facility {
  return {
    ...facility,
    licensed: patch.licensed ?? facility.licensed,
    stage: patch.stage ?? facility.stage,
    updatedAt: new Date().toISOString(),
    updatedBy: uid,
  };
}
