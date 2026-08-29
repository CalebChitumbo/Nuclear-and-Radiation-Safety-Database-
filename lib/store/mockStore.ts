import { computeAggregate } from "../rules/aggregate";
import { detectType } from "../rules/detectType";
import {
  applyInspectionRequestAction,
  buildInspectionRequest,
  inspectionFromCompletion,
  type InspectionRequestAction,
  type NewInspectionRequestInput,
  type RequestActor,
} from "../rules/inspectionRequests";
import {
  editId,
  sanitizePatch,
  validateEdit,
  type InventoryEdit,
  type InventoryEditInput,
  type InventoryKind,
} from "../rules/inventoryEdits";
import {
  isUsePossessionWorkflow,
  needsTypeClassification,
  workflowIssueDate,
  workflowLicenceType,
} from "../rules/licenceFamily";
import { recordLicence } from "../rules/recordLicence";
import { resolveFacilityStatus } from "../rules/supersede";
import {
  buildWorkflowComment,
  workflowHistoryOnSave,
} from "../rules/workflowNotes";
import {
  type Activity,
  type Border,
  type DailyEntry,
  type DashboardAggregate,
  type Facility,
  type Inspection,
  type InspectionRequest,
  type LicenceEvent,
  type LicenceType,
  type LicenceWorkflow,
  type TruckScan,
  type UserDoc,
  type WeekDef,
  type WeekMetrics,
  type WorkPlanBaseline,
  type WorkPlanConfig,
  type WorkPlanNote,
  type WorkPlanOutputConfig,
  type WorkPlanSubprogrammeConfig,
  type WorkflowNote,
  isUseP,
} from "../rules/types";
import { borderId } from "../rules/daily";
import { weekLabelForDate } from "../rules/week";
import { WORK_PLAN_YEAR } from "../rules/workPlan";
import facilitiesSeed from "../../seed/facilities.seed.json";
import screeningSeed from "../../seed/daily-screening-2026.seed.json";
import weeksSeed from "../../seed/weeks-2026.seed.json";
import {
  mapAllSeed,
  mapSeedBorders,
  mapSeedScreening,
  type SeedFacility,
  type SeedScreening,
} from "./seeding";
import type { DataStore } from "./types";

// v4: the August 2026 data refresh — the updated Licensing Status register and
// the inland offices' seeded daily screening log. Bumping the key makes every
// mock/demo browser start fresh from the new seed (the old register AND the
// history recorded against it are gone by design).
const STORAGE_KEY = "rpa-mock-store-v4";
const OLD_STORAGE_KEYS = [
  "rpa-mock-store-v1",
  "rpa-mock-store-v2",
  "rpa-mock-store-v3",
];

interface State {
  facilities: Facility[];
  licenceEvents: LicenceEvent[];
  inspections: Inspection[];
  inspectionRequests: InspectionRequest[];
  activities: Activity[];
  licenceWorkflows: LicenceWorkflow[];
  weekMetrics: Record<string, WeekMetrics>;
  workPlanNotes: Record<string, WorkPlanNote>;
  workPlanBaseline: Record<string, WorkPlanBaseline>;
  workPlanConfig: Record<string, WorkPlanConfig>;
  dailyEntries: DailyEntry[];
  borders: Border[];
  truckScans: TruckScan[];
  inventoryEdits: InventoryEdit[];
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
    workPlanNotes: {},
    workPlanBaseline: {},
    workPlanConfig: {},
    // The inland offices' 2026 screening log, seeded as daily entries so the
    // NSSS tab and work plan output 1.3.12 read real figures rather than an
    // opening balance — see docs/daily-screening-2026-import.md.
    dailyEntries: mapSeedScreening(screeningSeed as SeedScreening, weeksSeed),
    borders: mapSeedBorders(screeningSeed as SeedScreening),
    truckScans: [],
    inventoryEdits: [],
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
      {
        uid: "demo-nsss",
        email: "nsss@rpa.gov.zm",
        displayName: "NSSS Officer",
        role: "officer",
        section: "Nuclear Safety, Security & Safeguards",
      },
    ],
  };
}

function load(): State {
  if (typeof window === "undefined") return freshState();
  try {
    // Reclaim quota from superseded store versions.
    for (const k of OLD_STORAGE_KEYS) window.localStorage.removeItem(k);
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
    // Back-compat: stores saved before the Daily Updates tab existed.
    if (!parsed.dailyEntries) parsed.dailyEntries = [];
    // Back-compat: stores saved before the work plan report existed.
    if (!parsed.workPlanNotes) parsed.workPlanNotes = {};
    if (!parsed.workPlanBaseline) parsed.workPlanBaseline = {};
    // Back-compat: stores saved before the plan itself could be edited.
    if (!parsed.workPlanConfig) parsed.workPlanConfig = {};
    // Back-compat: stores saved before border posts existed.
    if (!parsed.borders) {
      parsed.borders = mapSeedBorders(screeningSeed as SeedScreening);
    }
    if (!parsed.truckScans) parsed.truckScans = [];
    // Back-compat: stores saved before the inventories became editable.
    if (!parsed.inventoryEdits) parsed.inventoryEdits = [];
    // Back-compat: add the NSSS demo account to older saved stores.
    if (!parsed.users.some((u) => u.uid === "demo-nsss")) {
      parsed.users.push({
        uid: "demo-nsss",
        email: "nsss@rpa.gov.zm",
        displayName: "NSSS Officer",
        role: "officer",
        section: "Nuclear Safety, Security & Safeguards",
      });
    }
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

  async listLicenceWorkflowsFor(facilityId: string): Promise<LicenceWorkflow[]> {
    return ensure()
      .licenceWorkflows.filter((w) => w.facilityId === facilityId)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  async addWorkflowNote(
    ran: string,
    text: string,
    actor: RequestActor,
  ): Promise<WorkflowNote> {
    const s = ensure();
    const key = ran.trim();
    const target =
      s.licenceWorkflows.find((w) => w.ran === key || w.id === key) ||
      s.licenceWorkflows.find(
        (w) => (w.ran || "").toUpperCase() === key.toUpperCase(),
      );
    if (!target) {
      throw new Error("Application not found — save it to the tracker first.");
    }
    const note = buildWorkflowComment(text, actor, new Date().toISOString());
    s.licenceWorkflows = s.licenceWorkflows.map((w) =>
      w === target
        ? {
            ...w,
            notes: [...(w.notes || []), note],
            updatedAt: note.at,
            updatedBy: actor.uid,
          }
        : w,
    );
    save(s);
    dispatchChange();
    return note;
  }

  async listInventoryEdits(): Promise<InventoryEdit[]> {
    return [...ensure().inventoryEdits];
  }

  async saveInventoryEdit(
    input: InventoryEditInput,
    actor: RequestActor,
  ): Promise<InventoryEdit> {
    const s = ensure();
    const patch = sanitizePatch(input.inventory, input.patch);
    const taken = new Set(
      s.inventoryEdits
        .filter((e) => e.inventory === input.inventory && e.added)
        .map((e) => e.key),
    );
    // An upsert re-validates against the other records, not against itself.
    taken.delete(input.key);
    const problem = validateEdit({ ...input, patch }, taken);
    if (problem) throw new Error(problem);

    const edit: InventoryEdit = {
      id: editId(input.inventory, input.key),
      inventory: input.inventory,
      key: input.key,
      patch,
      removed: input.removed || undefined,
      added: input.added || undefined,
      note: input.note?.trim() || undefined,
      updatedBy: actor.uid,
      updatedByName: actor.name,
      updatedAt: new Date().toISOString(),
    };
    const at = s.inventoryEdits.findIndex((e) => e.id === edit.id);
    // An addition stays an addition however many times it is later corrected.
    if (at >= 0) {
      edit.added = edit.added || s.inventoryEdits[at].added;
      s.inventoryEdits[at] = edit;
    } else {
      s.inventoryEdits.push(edit);
    }
    save(s);
    dispatchChange();
    return edit;
  }

  async revertInventoryEdit(
    inventory: InventoryKind,
    key: string,
  ): Promise<void> {
    const s = ensure();
    const id = editId(inventory, key);
    s.inventoryEdits = s.inventoryEdits.filter((e) => e.id !== id);
    save(s);
    dispatchChange();
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

  async listWeekMetricsAll(): Promise<WeekMetrics[]> {
    return Object.values(ensure().weekMetrics);
  }

  async listDailyEntries(): Promise<DailyEntry[]> {
    return [...ensure().dailyEntries].sort((a, b) =>
      b.date.localeCompare(a.date),
    );
  }

  async addDailyEntry(e: Omit<DailyEntry, "id">): Promise<DailyEntry> {
    const s = ensure();
    const entry: DailyEntry = {
      ...e,
      id: newId("day"),
      createdAt: new Date().toISOString(),
    };
    s.dailyEntries.push(entry);
    save(s);
    dispatchChange();
    return entry;
  }

  async deleteDailyEntry(id: string): Promise<void> {
    const s = ensure();
    s.dailyEntries = s.dailyEntries.filter((e) => e.id !== id);
    save(s);
    dispatchChange();
  }

  async listTruckScans(): Promise<TruckScan[]> {
    return [...ensure().truckScans].sort(
      (a, b) => b.date.localeCompare(a.date) || (b.time || "").localeCompare(a.time || ""),
    );
  }

  async listTruckScansFor(border: string, date: string): Promise<TruckScan[]> {
    return (await this.listTruckScans()).filter(
      (s) => s.border === border && s.date === date,
    );
  }

  async listTruckScansForWeek(week: string): Promise<TruckScan[]> {
    return (await this.listTruckScans()).filter((s) => s.week === week);
  }

  async addTruckScan(scan: Omit<TruckScan, "id">): Promise<TruckScan> {
    const s = ensure();
    const record: TruckScan = {
      ...scan,
      id: newId("scan"),
      createdAt: new Date().toISOString(),
    };
    s.truckScans.push(record);
    save(s);
    dispatchChange();
    return record;
  }

  async deleteTruckScan(id: string): Promise<void> {
    const s = ensure();
    s.truckScans = s.truckScans.filter((r) => r.id !== id);
    save(s);
    dispatchChange();
  }

  async listBorders(): Promise<Border[]> {
    return [...ensure().borders].sort((a, b) => a.name.localeCompare(b.name));
  }

  async addBorder(name: string, uid: string): Promise<Border> {
    const s = ensure();
    const trimmed = name.trim();
    if (!trimmed) throw new Error("A border name is required.");
    const id = borderId(trimmed);
    const existing = s.borders.find((b) => b.id === id);
    // Idempotent on name: re-adding an existing border just reactivates it.
    if (existing) {
      if (!existing.active) {
        existing.active = true;
        existing.updatedBy = uid;
        save(s);
        dispatchChange();
      }
      return existing;
    }
    const border: Border = {
      id,
      name: trimmed,
      active: true,
      createdAt: new Date().toISOString(),
      updatedBy: uid,
    };
    s.borders.push(border);
    save(s);
    dispatchChange();
    return border;
  }

  async setBorderActive(
    id: string,
    active: boolean,
    uid: string,
  ): Promise<void> {
    const s = ensure();
    s.borders = s.borders.map((b) =>
      b.id === id ? { ...b, active, updatedBy: uid } : b,
    );
    save(s);
    dispatchChange();
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

  async listWorkPlanNotes(): Promise<WorkPlanNote[]> {
    return Object.values(ensure().workPlanNotes);
  }

  async getWorkPlanBaseline(year: number): Promise<WorkPlanBaseline | null> {
    return ensure().workPlanBaseline[String(year)] || null;
  }

  async setWorkPlanBaseline(
    year: number,
    values: Record<string, number[]>,
    uid: string,
    note?: string,
  ): Promise<void> {
    const s = ensure();
    s.workPlanBaseline[String(year)] = {
      year,
      values,
      note,
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    };
    save(s);
    dispatchChange();
  }

  async getWorkPlanConfig(year: number): Promise<WorkPlanConfig | null> {
    return ensure().workPlanConfig[String(year)] || null;
  }

  async setWorkPlanOutputConfig(
    year: number,
    id: string,
    entry: WorkPlanOutputConfig | null,
    uid: string,
  ): Promise<void> {
    const s = ensure();
    const key = String(year);
    const current = s.workPlanConfig[key] || { year, outputs: {}, subprogrammes: {} };
    const outputs = { ...(current.outputs || {}) };
    // Clearing an entry hands the row back to the approved plan.
    if (entry) {
      outputs[id] = { ...entry, updatedAt: new Date().toISOString(), updatedBy: uid };
    } else {
      delete outputs[id];
    }
    s.workPlanConfig[key] = {
      ...current,
      year,
      outputs,
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    };
    save(s);
    dispatchChange();
  }

  async setWorkPlanSubprogrammeConfig(
    year: number,
    id: string,
    entry: WorkPlanSubprogrammeConfig | null,
    uid: string,
  ): Promise<void> {
    const s = ensure();
    const key = String(year);
    const current = s.workPlanConfig[key] || { year, outputs: {}, subprogrammes: {} };
    const subprogrammes = { ...(current.subprogrammes || {}) };
    if (entry) {
      subprogrammes[id] = {
        ...entry,
        updatedAt: new Date().toISOString(),
        updatedBy: uid,
      };
    } else {
      delete subprogrammes[id];
    }
    s.workPlanConfig[key] = {
      ...current,
      year,
      subprogrammes,
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    };
    save(s);
    dispatchChange();
  }

  async resetWorkPlanConfig(year: number, uid: string): Promise<void> {
    const s = ensure();
    s.workPlanConfig[String(year)] = {
      year,
      outputs: {},
      subprogrammes: {},
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    };
    save(s);
    dispatchChange();
  }

  async setWorkPlanNote(
    id: string,
    patch: Pick<WorkPlanNote, "status" | "comments" | "actionPoints">,
    uid: string,
  ): Promise<void> {
    const s = ensure();
    s.workPlanNotes[id] = {
      ...(s.workPlanNotes[id] || { id }),
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    };
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
        ...inspectionFromCompletion(current, action, week, now),
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
    actor?: RequestActor,
  ): Promise<{ saved: number; facilitiesUpdated: number }> {
    const s = ensure();
    const now = new Date().toISOString();
    const weeks = weeksSeed as WeekDef[];
    const noteActor: RequestActor = actor ?? { uid, name: "", section: "" };

    const byRan = new Map(s.licenceWorkflows.map((w) => [w.ran || w.id, w]));
    // Preserve a previously officer-assigned type when an update omits it, so the
    // classification sticks to the licence number across notifications. (Firebase
    // gets this for free from merge writes.) The notes trail is likewise owned by
    // the stored record: an import payload never replaces it — this save only
    // appends the automatic history entries the change produces.
    const saved = items.map((item) => {
      const prior = byRan.get(item.ran || item.id);
      return {
        ...item,
        officerType: item.officerType ?? prior?.officerType,
        notes: [
          ...(prior?.notes || []),
          ...workflowHistoryOnSave(prior, item, noteActor, now),
        ],
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
      workPlanNotes: Object.values(s.workPlanNotes),
      workPlanBaseline:
        s.workPlanBaseline[String(WORK_PLAN_YEAR)] || null,
      workPlanConfig: s.workPlanConfig[String(WORK_PLAN_YEAR)] || null,
      dailyEntries: s.dailyEntries,
      inventoryEdits: s.inventoryEdits,
      truckScans: s.truckScans,
      borders: s.borders,
    };
  }
}

export const mockStore = new MockStore();
