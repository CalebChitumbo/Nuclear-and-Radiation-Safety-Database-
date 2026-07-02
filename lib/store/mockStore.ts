import { computeAggregate } from "../rules/aggregate";
import { detectType } from "../rules/detectType";
import {
  applyInspectionRequestAction,
  buildInspectionRequest,
  type InspectionRequestAction,
  type NewInspectionRequestInput,
  type RequestActor,
} from "../rules/inspectionRequests";
import {
  isUsePossessionWorkflow,
  needsTypeClassification,
  workflowIssueDate,
  workflowLicenceType,
} from "../rules/licenceFamily";
import { recordLicence } from "../rules/recordLicence";
import { resolveFacilityStatus } from "../rules/supersede";
import {
  type Activity,
  type DashboardAggregate,
  type Facility,
  type Inspection,
  type InspectionRequest,
  type LicenceEvent,
  type LicenceType,
  type LicenceWorkflow,
  type UserDoc,
  type WeekDef,
  type WeekMetrics,
  isUseP,
} from "../rules/types";
import { weekLabelForDate } from "../rules/week";
import facilitiesSeed from "../../seed/facilities.seed.json";
import weeksSeed from "../../seed/weeks-2026.seed.json";
import { mapAllSeed, type SeedFacility } from "./seeding";
import type { DataStore } from "./types";

const STORAGE_KEY = "rpa-mock-store-v1";

interface State {
  facilities: Facility[];
  licenceEvents: LicenceEvent[];
  inspections: Inspection[];
  inspectionRequests: InspectionRequest[];
  activities: Activity[];
  licenceWorkflows: LicenceWorkflow[];
  weekMetrics: Record<string, WeekMetrics>;
  users: UserDoc[];
}

function freshState(): State {
  return {
    facilities: mapAllSeed(facilitiesSeed as SeedFacility[]),
    licenceEvents: [],
    inspections: [],
    inspectionRequests: [],
    activities: [],
    licenceWorkflows: [],
    weekMetrics: {},
    users: [
      {
        uid: "demo-admin",
        email: "admin@rpa.gov.zm",
        displayName: "Demo Administrator",
        role: "admin",
        section: "All",
      },
      {
        uid: "demo-as",
        email: "as.officer@rpa.gov.zm",
        displayName: "A&S Officer",
        role: "officer",
        section: "Authorisation & Standards",
      },
      {
        uid: "demo-insp",
        email: "inspector@rpa.gov.zm",
        displayName: "Inspectorate Officer",
        role: "officer",
        section: "Inspectorate",
      },
    ],
  };
}

function load(): State {
  if (typeof window === "undefined") return freshState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const s = freshState();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      return s;
    }
    const parsed = JSON.parse(raw) as State;
    // Back-compat: stores saved before the Licensing Status tab lack this array.
    if (!parsed.licenceWorkflows) parsed.licenceWorkflows = [];
    // Back-compat: stores saved before the inspection-request workflow existed.
    if (!parsed.inspectionRequests) parsed.inspectionRequests = [];
    return parsed;
  } catch {
    return freshState();
  }
}

function save(state: State): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

let state: State | null = null;

function ensure(): State {
  if (!state) state = load();
  return state;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function dispatchChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("rpa-store-change"));
  }
}

export function resetMockStore(): void {
  state = freshState();
  save(state);
  dispatchChange();
}

class MockStore implements DataStore {
  async ready(): Promise<void> {
    ensure();
  }

  async listFacilities(): Promise<Facility[]> {
    return [...ensure().facilities];
  }

  async getFacility(id: string): Promise<Facility | null> {
    return ensure().facilities.find((f) => f.id === id) || null;
  }

  async listLicenceEvents(): Promise<LicenceEvent[]> {
    return [...ensure().licenceEvents].sort((a, b) =>
      b.date.localeCompare(a.date),
    );
  }

  async listLicenceEventsFor(facilityId: string): Promise<LicenceEvent[]> {
    return ensure()
      .licenceEvents.filter((e) => e.facilityId === facilityId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async listInspections(): Promise<Inspection[]> {
    return [...ensure().inspections].sort((a, b) =>
      b.date.localeCompare(a.date),
    );
  }

  async listInspectionsFor(facilityId: string): Promise<Inspection[]> {
    return ensure()
      .inspections.filter((i) => i.facilityId === facilityId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async listActivities(): Promise<Activity[]> {
    return [...ensure().activities];
  }

  async listLicenceWorkflows(): Promise<LicenceWorkflow[]> {
    return [...ensure().licenceWorkflows];
  }

  async listUsers(): Promise<UserDoc[]> {
    return [...ensure().users];
  }

  async getAggregate(): Promise<DashboardAggregate> {
    return computeAggregate(ensure().facilities);
  }

  async getWeeks(): Promise<WeekDef[]> {
    return weeksSeed as WeekDef[];
  }

  async getWeekMetrics(week: string): Promise<WeekMetrics> {
    const s = ensure();
    return (
      s.weekMetrics[week] ||
      ({ week, values: {}, status: {}, submittedBy: {} } as WeekMetrics)
    );
  }

  async setWeekMetricValue(
    week: string,
    key: string,
    value: number,
  ): Promise<void> {
    const s = ensure();
    const wm = s.weekMetrics[week] || {
      week,
      values: {},
      status: {},
      submittedBy: {},
    };
    wm.values[key] = value;
    s.weekMetrics[week] = wm;
    save(s);
    dispatchChange();
  }

  async addActivity(a: Omit<Activity, "id">): Promise<Activity> {
    const s = ensure();
    const id = newId("act");
    const act: Activity = { id, ...a, createdAt: new Date().toISOString() };
    s.activities.push(act);
    save(s);
    dispatchChange();
    return act;
  }

  async updateActivity(id: string, patch: Partial<Activity>): Promise<void> {
    const s = ensure();
    s.activities = s.activities.map((a) =>
      a.id === id ? { ...a, ...patch } : a,
    );
    save(s);
    dispatchChange();
  }

  async deleteActivity(id: string): Promise<void> {
    const s = ensure();
    s.activities = s.activities.filter((a) => a.id !== id);
    save(s);
    dispatchChange();
  }

  async recordLicences(
    inputs: Array<{
      facilityId: string | null;
      number: string;
      type: string;
      date: string;
      newFacilityDraft?: Partial<Facility>;
    }>,
    uid: string,
  ): ReturnType<DataStore["recordLicences"]> {
    const s = ensure();
    const weeks = (weeksSeed as WeekDef[]);
    const eventIds: string[] = [];
    const facilityIds: string[] = [];
    let newLicensed = 0;
    let renewals = 0;
    let otherAuths = 0;
    let skipped = 0;

    for (const inp of inputs) {
      const eventId = newId("evt");
      const fac =
        inp.facilityId === null
          ? null
          : s.facilities.find((f) => f.id === inp.facilityId) || null;

      let newFacilityId: string | undefined;
      if (!fac) {
        newFacilityId = newId("fac");
      }

      const detected: LicenceType = (inp.type as LicenceType) ||
        detectType(
          inp.number,
          "New Use/Possession Licence" as LicenceType,
        );

      const result = recordLicence({
        facility: fac,
        newFacilityDraft: inp.newFacilityDraft,
        number: inp.number,
        type: detected,
        defaultType: detected,
        date: inp.date,
        weeks,
        uid,
        newFacilityId,
        newEventId: eventId,
      });

      const facWrite = result.facilityWrite;
      if (fac) {
        s.facilities = s.facilities.map((f) =>
          f.id === fac.id ? facWrite : f,
        );
      } else {
        s.facilities.push(facWrite);
      }
      s.licenceEvents.push(result.event);

      facilityIds.push(facWrite.id);
      eventIds.push(eventId);

      switch (result.effect) {
        case "becomes-licensed":
        case "new-licensed":
          newLicensed += 1;
          break;
        case "renewal-logged":
          renewals += 1;
          break;
        default:
          if (isUseP(detected)) {
            renewals += 1;
          } else {
            otherAuths += 1;
          }
      }
    }

    save(s);
    dispatchChange();
    return {
      eventIds,
      facilityIds,
      summary: { newLicensed, renewals, otherAuths, skipped },
    };
  }

  async addInspection(i: Omit<Inspection, "id">): Promise<Inspection> {
    const s = ensure();
    const id = newId("insp");
    const week = weekLabelForDate(i.date, weeksSeed as WeekDef[], "");
    const ins: Inspection = {
      ...i,
      week,
      id,
      createdAt: new Date().toISOString(),
    };
    s.inspections.push(ins);
    save(s);
    dispatchChange();
    return ins;
  }

  async listInspectionRequests(): Promise<InspectionRequest[]> {
    return [...ensure().inspectionRequests].sort((a, b) =>
      (b.requestedAt || "").localeCompare(a.requestedAt || ""),
    );
  }

  async listInspectionRequestsFor(
    facilityId: string,
  ): Promise<InspectionRequest[]> {
    return ensure()
      .inspectionRequests.filter((r) => r.facilityId === facilityId)
      .sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""));
  }

  async addInspectionRequest(
    input: NewInspectionRequestInput,
    actor: RequestActor,
  ): Promise<InspectionRequest> {
    const s = ensure();
    const now = new Date().toISOString();
    const week = weekLabelForDate(now.slice(0, 10), weeksSeed as WeekDef[], "");
    const draft = buildInspectionRequest(input, actor, now, week);
    const request: InspectionRequest = { ...draft, id: newId("insreq") };
    s.inspectionRequests.push(request);
    save(s);
    dispatchChange();
    return request;
  }

  async updateInspectionRequest(
    id: string,
    action: InspectionRequestAction,
    actor: RequestActor,
  ): Promise<InspectionRequest> {
    const s = ensure();
    const now = new Date().toISOString();
    const current = s.inspectionRequests.find((r) => r.id === id);
    if (!current) throw new Error("Inspection request not found.");

    let updated = applyInspectionRequestAction(current, action, actor, now);

    // Completing a request records the dated Inspection it produced, so the
    // Inspectorate's "inspections conducted" log and the weekly report stay in
    // one place. Link it back onto the request.
    if (action.kind === "complete") {
      const week = weekLabelForDate(
        action.completedDate,
        weeksSeed as WeekDef[],
        "",
      );
      const inspection: Inspection = {
        id: newId("insp"),
        date: action.completedDate,
        week,
        facilityId: current.facilityId,
        facilityName: current.facilityName,
        type: current.type,
        outcome: action.outcome,
        province: current.province,
        sector: current.sector,
        notes:
          action.findings?.trim() ||
          `Pre-authorisation inspection for ${current.facilityName}.`,
        requestId: id,
        createdAt: now,
      };
      s.inspections.push(inspection);
      updated = { ...updated, inspectionId: inspection.id };
    }

    s.inspectionRequests = s.inspectionRequests.map((r) =>
      r.id === id ? updated : r,
    );
    save(s);
    dispatchChange();
    return updated;
  }

  async saveLicenceWorkflows(
    items: LicenceWorkflow[],
    uid: string,
  ): Promise<{ saved: number; facilitiesUpdated: number }> {
    const s = ensure();
    const now = new Date().toISOString();
    const weeks = weeksSeed as WeekDef[];

    const byRan = new Map(s.licenceWorkflows.map((w) => [w.ran || w.id, w]));
    // Preserve a previously officer-assigned type when an update omits it, so the
    // classification sticks to the licence number across notifications. (Firebase
    // gets this for free from merge writes.)
    const saved = items.map((item) => {
      const prior = byRan.get(item.ran || item.id);
      return {
        ...item,
        officerType: item.officerType ?? prior?.officerType,
        updatedAt: now,
        updatedBy: uid,
      };
    });
    for (const item of saved) byRan.set(item.ran || item.id, item);
    s.licenceWorkflows = [...byRan.values()];

    const matched = saved.filter(
      (w) => w.facilityId && !w.facilityName.includes("Unrecognized"),
    );
    const facMap = new Map(s.facilities.map((f) => [f.id, f]));
    const dirty = new Set<string>();

    // 1. Issued applications → recorded on the facility through the R1–R6 rules.
    //    recordLicence does the right thing per family: a confirmed
    //    Use/Possession issuance flips the facility to officially Licensed and
    //    logs the dated licence event; every other type (import/transit/transfer/
    //    variation/…) is recorded as a standalone authorisation the facility holds
    //    — counted toward the licences issued, but never changing licensed status.
    for (const w of matched) {
      if (needsTypeClassification(w)) continue; // unclassified FORM-I: held out
      if (w.facilityStage !== "Licence / Certificate Issued") continue;
      if (!w.ran) continue;
      const fac = facMap.get(w.facilityId as string);
      if (!fac) continue;
      // A Use/Possession certificate licenses the facility; an already-licensed
      // one is left to its manual renewal flow (never auto-record a renewal here).
      if (isUsePossessionWorkflow(w) && fac.licensed) continue;
      if (
        (fac.auths || []).some(
          (a) => a.number && a.number.toUpperCase() === w.ran.toUpperCase(),
        )
      ) {
        continue;
      }
      const type = workflowLicenceType(w);
      const result = recordLicence({
        facility: fac,
        number: w.ran,
        type,
        defaultType: type,
        date: workflowIssueDate(w),
        weeks,
        uid,
        newEventId: newId("evt"),
      });
      s.licenceEvents.push(result.event);
      facMap.set(fac.id, result.facilityWrite);
      dirty.add(fac.id);
    }

    // 2. Use/Possession pipeline stage (pre-issuance). The issued case is handled
    //    in step 1, which licenses the facility; here we only roll the in-flight
    //    renewal stage forward. Mirrors firebaseStore: resolve each touched
    //    facility's single displayed status from the most recent applicable
    //    Use/Possession workflow (all stored, including this save), so the result
    //    is supersede-correct instead of last-saved-wins. Standalone
    //    authorisations never drive the register stage; never downgrade an
    //    already-Licensed facility.
    const upByFacility = new Map<string, LicenceWorkflow[]>();
    for (const w of s.licenceWorkflows) {
      if (!w.facilityId || !isUsePossessionWorkflow(w)) continue;
      if (needsTypeClassification(w)) continue; // unclassified FORM-I: held out
      const arr = upByFacility.get(w.facilityId) || [];
      arr.push(w);
      upByFacility.set(w.facilityId, arr);
    }
    const upTouched = new Set(
      matched
        .filter((w) => isUsePossessionWorkflow(w) && !needsTypeClassification(w))
        .map((w) => w.facilityId as string),
    );
    for (const facilityId of upTouched) {
      const fac = facMap.get(facilityId);
      if (!fac || fac.licensed) continue;
      const resolved = resolveFacilityStatus(upByFacility.get(facilityId) || []);
      if (!resolved) continue;
      if (
        fac.stage !== resolved.stage ||
        fac.currentStatus !== resolved.currentStatus
      ) {
        facMap.set(facilityId, {
          ...fac,
          stage: resolved.stage,
          currentStatus: resolved.currentStatus,
        });
        dirty.add(facilityId);
      }
    }

    if (dirty.size) {
      s.facilities = s.facilities.map((f) =>
        dirty.has(f.id)
          ? { ...(facMap.get(f.id) as Facility), updatedAt: now, updatedBy: uid }
          : f,
      );
    }

    save(s);
    dispatchChange();
    return { saved: items.length, facilitiesUpdated: dirty.size };
  }

  async updateFacility(
    id: string,
    patch: Partial<Facility>,
    uid: string,
  ): Promise<void> {
    const s = ensure();
    s.facilities = s.facilities.map((f) =>
      f.id === id
        ? { ...f, ...patch, updatedAt: new Date().toISOString(), updatedBy: uid }
        : f,
    );
    save(s);
    dispatchChange();
  }

  async addFacility(
    f: Omit<Facility, "id">,
    uid: string,
  ): Promise<Facility> {
    const s = ensure();
    const id = f.facCode
      ? f.facCode.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()
      : newId("fac");
    const facility: Facility = {
      ...f,
      id,
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    };
    s.facilities.push(facility);
    save(s);
    dispatchChange();
    return facility;
  }

  async addUser(u: Omit<UserDoc, "uid">): Promise<UserDoc> {
    const s = ensure();
    const uid = newId("usr");
    const user: UserDoc = { ...u, uid };
    s.users.push(user);
    save(s);
    dispatchChange();
    return user;
  }

  async provisionUser(input: {
    email: string;
    displayName: string;
    role: UserDoc["role"];
    section: UserDoc["section"];
    password: string;
  }): Promise<{ uid: string }> {
    // Demo mode has no real Auth backend — store the account locally and ignore
    // the password. Mirrors what the setUserClaims Cloud Function does in
    // Firebase mode (create the user + persist role/section).
    const user = await this.addUser({
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      section: input.section,
    });
    return { uid: user.uid };
  }

  async setUserDisabled(uid: string, disabled: boolean): Promise<void> {
    const s = ensure();
    s.users = s.users.map((u) => (u.uid === uid ? { ...u, disabled } : u));
    save(s);
    dispatchChange();
  }

  async exportAll() {
    const s = ensure();
    return {
      facilities: s.facilities,
      licenceEvents: s.licenceEvents,
      inspections: s.inspections,
      inspectionRequests: s.inspectionRequests,
      activities: s.activities,
      licenceWorkflows: s.licenceWorkflows,
      weekMetrics: s.weekMetrics,
    };
  }
}

export const mockStore = new MockStore();
