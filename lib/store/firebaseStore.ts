"use client";

import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import { getDb, getFbFunctions } from "../firebase";
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
  type WorkPlanNote,
  type WorkflowNote,
  isUseP,
} from "../rules/types";
import { weekLabelForDate } from "../rules/week";
import { WORK_PLAN_YEAR } from "../rules/workPlan";
import type { DataStore } from "./types";
import weeksSeed from "../../seed/weeks-2026.seed.json";

function requireDb(): Firestore {
  const db = getDb();
  if (!db) throw new Error("Firestore is not configured.");
  return db;
}

/**
 * How far back the cross-post scan feed reads. A busy post logs 200–400 scans
 * a day, so the whole collection is not something to pull into a browser: this
 * window is what the pickers and "last seen this unit" lookups need, and the
 * exact figures come from the per-shift and per-week queries instead.
 */
const RECENT_SCAN_LIMIT = 4000;

/**
 * Drop keys whose value is `undefined`. The web Firestore SDK rejects undefined
 * field values (unlike the Admin SDK, which sets ignoreUndefinedProperties). The
 * parser emits optional keys (paymentRan, currentStatus, special…) as undefined
 * when absent, so sanitize before any client write.
 */
function stripUndefined<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}

class FirebaseStore implements DataStore {
  async ready(): Promise<void> {
    requireDb();
  }

  async listFacilities(): Promise<Facility[]> {
    const db = requireDb();
    const snap = await getDocs(collection(db, "facilities"));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Facility, "id">) }));
  }

  async getFacility(id: string): Promise<Facility | null> {
    const db = requireDb();
    const snap = await getDoc(doc(db, "facilities", id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<Facility, "id">) };
  }

  async listLicenceEvents(): Promise<LicenceEvent[]> {
    const db = requireDb();
    const snap = await getDocs(collection(db, "licenceEvents"));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<LicenceEvent, "id">) }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async listLicenceEventsFor(facilityId: string): Promise<LicenceEvent[]> {
    const db = requireDb();
    // Backed by the (facilityId ASC, date DESC) composite index.
    const snap = await getDocs(
      query(
        collection(db, "licenceEvents"),
        where("facilityId", "==", facilityId),
        orderBy("date", "desc"),
      ),
    );
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LicenceEvent, "id">) }));
  }

  async listInspections(): Promise<Inspection[]> {
    const db = requireDb();
    const snap = await getDocs(collection(db, "inspections"));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Inspection, "id">) }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async listInspectionsFor(facilityId: string): Promise<Inspection[]> {
    const db = requireDb();
    // Backed by the (facilityId ASC, date DESC) composite index.
    const snap = await getDocs(
      query(
        collection(db, "inspections"),
        where("facilityId", "==", facilityId),
        orderBy("date", "desc"),
      ),
    );
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Inspection, "id">) }));
  }

  async listActivities(): Promise<Activity[]> {
    const db = requireDb();
    const snap = await getDocs(collection(db, "activities"));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Activity, "id">) }));
  }

  async listLicenceWorkflows(): Promise<LicenceWorkflow[]> {
    const db = requireDb();
    const snap = await getDocs(collection(db, "licenceWorkflows"));
    return snap.docs.map(
      (d) => ({ id: d.id, ...(d.data() as Omit<LicenceWorkflow, "id">) }),
    );
  }

  async listLicenceWorkflowsFor(facilityId: string): Promise<LicenceWorkflow[]> {
    const db = requireDb();
    // Single-field equality — covered by the automatic index; sorted client-side.
    const snap = await getDocs(
      query(
        collection(db, "licenceWorkflows"),
        where("facilityId", "==", facilityId),
      ),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<LicenceWorkflow, "id">) }))
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  async addWorkflowNote(
    ran: string,
    text: string,
    actor: RequestActor,
  ): Promise<WorkflowNote> {
    const db = requireDb();
    // Same deterministic doc id saveLicenceWorkflows uses, so the note lands on
    // the tracked application regardless of which surface the officer wrote it
    // from (Smart Status Update drawer or the facility drawer).
    const id = ran.trim().replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();
    const note = buildWorkflowComment(text, actor, new Date().toISOString());
    try {
      // updateDoc, not set+merge: a note may only attach to an application that
      // is already tracked (a merge would create a partial doc), and arrayUnion
      // makes the append safe against two officers commenting at once. The write
      // touches exactly the fields the cross-section security rule allows.
      await updateDoc(doc(db, "licenceWorkflows", id), {
        notes: arrayUnion(stripUndefined(note)),
        updatedAt: note.at,
        updatedBy: actor.uid,
      });
    } catch (err) {
      throw new Error(
        `Could not add the note — the application may not be saved yet (${
          err instanceof Error ? err.message : err
        }).`,
      );
    }
    return note;
  }

  async listUsers(): Promise<UserDoc[]> {
    const db = requireDb();
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<UserDoc, "uid">) }));
  }

  async getAggregate(): Promise<DashboardAggregate> {
    const db = requireDb();
    const ref = doc(db, "aggregates", "dashboard");
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data() as DashboardAggregate;
    const facilities = await this.listFacilities();
    return computeAggregate(facilities);
  }

  async getWeeks(): Promise<WeekDef[]> {
    return weeksSeed as WeekDef[];
  }

  async getWeekMetrics(week: string): Promise<WeekMetrics> {
    const db = requireDb();
    const ref = doc(db, "weekMetrics", week);
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data() as WeekMetrics;
    return { week, values: {}, status: {}, submittedBy: {} };
  }

  async listWeekMetricsAll(): Promise<WeekMetrics[]> {
    const db = requireDb();
    const snap = await getDocs(collection(db, "weekMetrics"));
    return snap.docs.map((d) => d.data() as WeekMetrics);
  }

  async listDailyEntries(): Promise<DailyEntry[]> {
    const db = requireDb();
    const snap = await getDocs(collection(db, "dailyEntries"));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<DailyEntry, "id">) }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async addDailyEntry(e: Omit<DailyEntry, "id">): Promise<DailyEntry> {
    const db = requireDb();
    const createdAt = new Date().toISOString();
    const ref = await addDoc(
      collection(db, "dailyEntries"),
      stripUndefined({ ...e, createdAt }),
    );
    return { ...e, id: ref.id, createdAt };
  }

  async deleteDailyEntry(id: string): Promise<void> {
    const db = requireDb();
    await deleteDoc(doc(db, "dailyEntries", id));
  }

  async listTruckScans(): Promise<TruckScan[]> {
    const db = requireDb();
    const snap = await getDocs(
      query(
        collection(db, "truckScans"),
        orderBy("date", "desc"),
        limit(RECENT_SCAN_LIMIT),
      ),
    );
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<TruckScan, "id">),
    }));
  }

  async listTruckScansFor(border: string, date: string): Promise<TruckScan[]> {
    const db = requireDb();
    const snap = await getDocs(
      query(
        collection(db, "truckScans"),
        where("border", "==", border),
        where("date", "==", date),
      ),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<TruckScan, "id">) }))
      .sort((a, b) => (b.time || "").localeCompare(a.time || ""));
  }

  async listTruckScansForWeek(week: string): Promise<TruckScan[]> {
    const db = requireDb();
    const snap = await getDocs(
      query(collection(db, "truckScans"), where("week", "==", week)),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<TruckScan, "id">) }))
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""),
      );
  }

  async addTruckScan(scan: Omit<TruckScan, "id">): Promise<TruckScan> {
    const db = requireDb();
    const createdAt = new Date().toISOString();
    const ref = await addDoc(
      collection(db, "truckScans"),
      stripUndefined({ ...scan, createdAt }),
    );
    return { ...scan, id: ref.id, createdAt };
  }

  async deleteTruckScan(id: string): Promise<void> {
    const db = requireDb();
    await deleteDoc(doc(db, "truckScans", id));
  }

  async listBorders(): Promise<Border[]> {
    const db = requireDb();
    const snap = await getDocs(collection(db, "borders"));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Border, "id">) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async addBorder(name: string, uid: string): Promise<Border> {
    const db = requireDb();
    const trimmed = name.trim();
    if (!trimmed) throw new Error("A border name is required.");
    // Deterministic id from the name so re-adding upserts (and reactivates)
    // the same border instead of duplicating it.
    const id = trimmed.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();
    const border: Border = {
      id,
      name: trimmed,
      active: true,
      createdAt: new Date().toISOString(),
      updatedBy: uid,
    };
    await setDoc(doc(db, "borders", id), border, { merge: true });
    return border;
  }

  async setBorderActive(
    id: string,
    active: boolean,
    uid: string,
  ): Promise<void> {
    const db = requireDb();
    await setDoc(
      doc(db, "borders", id),
      { active, updatedBy: uid },
      { merge: true },
    );
  }

  async setWeekMetricValue(
    week: string,
    key: string,
    value: number,
  ): Promise<void> {
    const db = requireDb();
    const ref = doc(db, "weekMetrics", week);
    const existing = await getDoc(ref);
    const wm: WeekMetrics = existing.exists()
      ? (existing.data() as WeekMetrics)
      : { week, values: {}, status: {}, submittedBy: {} };
    wm.values[key] = value;
    await setDoc(ref, wm, { merge: true });
  }

  async listWorkPlanNotes(): Promise<WorkPlanNote[]> {
    const db = requireDb();
    const snap = await getDocs(collection(db, "workPlanNotes"));
    return snap.docs.map((d) => ({
      ...(d.data() as Omit<WorkPlanNote, "id">),
      id: d.id,
    }));
  }

  async getWorkPlanBaseline(year: number): Promise<WorkPlanBaseline | null> {
    const db = requireDb();
    const snap = await getDoc(doc(db, "workPlanBaseline", String(year)));
    return snap.exists() ? (snap.data() as WorkPlanBaseline) : null;
  }

  async setWorkPlanBaseline(
    year: number,
    values: Record<string, number[]>,
    uid: string,
    note?: string,
  ): Promise<void> {
    const db = requireDb();
    // Not merged: a re-baseline replaces the year's opening figures outright,
    // so an output an officer zeroed does not keep its old carry-in.
    await setDoc(
      doc(db, "workPlanBaseline", String(year)),
      stripUndefined({
        year,
        values,
        note,
        updatedAt: new Date().toISOString(),
        updatedBy: uid,
      }),
    );
  }

  async setWorkPlanNote(
    id: string,
    patch: Pick<WorkPlanNote, "status" | "comments" | "actionPoints">,
    uid: string,
  ): Promise<void> {
    const db = requireDb();
    await setDoc(
      doc(db, "workPlanNotes", id),
      stripUndefined({
        ...patch,
        id,
        updatedAt: new Date().toISOString(),
        updatedBy: uid,
      }),
      { merge: true },
    );
  }

  async addActivity(a: Omit<Activity, "id">): Promise<Activity> {
    const db = requireDb();
    const ref = await addDoc(collection(db, "activities"), {
      ...a,
      createdAt: new Date().toISOString(),
    });
    return { ...a, id: ref.id, createdAt: new Date().toISOString() };
  }

  async updateActivity(id: string, patch: Partial<Activity>): Promise<void> {
    const db = requireDb();
    await updateDoc(doc(db, "activities", id), patch as any);
  }

  async deleteActivity(id: string): Promise<void> {
    const db = requireDb();
    await deleteDoc(doc(db, "activities", id));
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
    const db = requireDb();
    const batch = writeBatch(db);
    const weeks = weeksSeed as WeekDef[];

    const facilities = await this.listFacilities();
    const facMap = new Map(facilities.map((f) => [f.id, f]));

    const eventIds: string[] = [];
    const facilityIds: string[] = [];
    let newLicensed = 0;
    let renewals = 0;
    let otherAuths = 0;
    const skipped = 0;

    for (const inp of inputs) {
      const eventRef = doc(collection(db, "licenceEvents"));
      const eventId = eventRef.id;
      const fac =
        inp.facilityId === null ? null : facMap.get(inp.facilityId) || null;

      const detected: LicenceType =
        (inp.type as LicenceType) ||
        detectType(inp.number, "New Use/Possession Licence" as LicenceType);

      let newFacilityRef = null as ReturnType<typeof doc> | null;
      if (!fac) {
        newFacilityRef = doc(collection(db, "facilities"));
      }

      const result = recordLicence({
        facility: fac,
        newFacilityDraft: inp.newFacilityDraft,
        number: inp.number,
        type: detected,
        defaultType: detected,
        date: inp.date,
        weeks,
        uid,
        newFacilityId: newFacilityRef?.id,
        newEventId: eventId,
      });

      if (fac) {
        batch.set(doc(db, "facilities", fac.id), result.facilityWrite, {
          merge: true,
        });
        facMap.set(fac.id, result.facilityWrite);
        facilityIds.push(fac.id);
      } else if (newFacilityRef) {
        batch.set(newFacilityRef, { ...result.facilityWrite, id: newFacilityRef.id });
        facMap.set(newFacilityRef.id, {
          ...result.facilityWrite,
          id: newFacilityRef.id,
        });
        facilityIds.push(newFacilityRef.id);
      }

      batch.set(eventRef, { ...result.event, id: eventId });
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
          if (isUseP(detected)) renewals += 1;
          else otherAuths += 1;
      }
    }

    // NOTE: aggregates/dashboard is maintained by the onFacilityWrite Cloud
    // Function (Admin SDK). firestore.rules blocks client writes to it
    // ("allow write: if false"), and a Firestore batch is atomic — including
    // an aggregate write here would make the whole bulk-approval commit fail
    // with a permission error. So we deliberately omit it; the Cloud Function
    // recomputes the rollup once these facility writes land.
    await batch.commit();
    return {
      eventIds,
      facilityIds,
      summary: { newLicensed, renewals, otherAuths, skipped },
    };
  }

  async addInspection(i: Omit<Inspection, "id">): Promise<Inspection> {
    const db = requireDb();
    const week = weekLabelForDate(i.date, weeksSeed as WeekDef[], "");
    const ref = await addDoc(
      collection(db, "inspections"),
      stripUndefined({ ...i, week }),
    );
    return { ...i, week, id: ref.id };
  }

  async listInspectionRequests(): Promise<InspectionRequest[]> {
    const db = requireDb();
    const snap = await getDocs(collection(db, "inspectionRequests"));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<InspectionRequest, "id">) }))
      .sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""));
  }

  async listInspectionRequestsFor(
    facilityId: string,
  ): Promise<InspectionRequest[]> {
    const db = requireDb();
    // Backed by the (facilityId ASC, requestedAt DESC) composite index.
    const snap = await getDocs(
      query(
        collection(db, "inspectionRequests"),
        where("facilityId", "==", facilityId),
        orderBy("requestedAt", "desc"),
      ),
    );
    return snap.docs.map(
      (d) => ({ id: d.id, ...(d.data() as Omit<InspectionRequest, "id">) }),
    );
  }

  async addInspectionRequest(
    input: NewInspectionRequestInput,
    actor: RequestActor,
  ): Promise<InspectionRequest> {
    const db = requireDb();
    const now = new Date().toISOString();
    const week = weekLabelForDate(now.slice(0, 10), weeksSeed as WeekDef[], "");
    const draft = buildInspectionRequest(input, actor, now, week);
    const ref = doc(collection(db, "inspectionRequests"));
    const request: InspectionRequest = { ...draft, id: ref.id };
    await setDoc(ref, stripUndefined(request));
    return request;
  }

  async updateInspectionRequest(
    id: string,
    action: InspectionRequestAction,
    actor: RequestActor,
  ): Promise<InspectionRequest> {
    const db = requireDb();
    const now = new Date().toISOString();
    const ref = doc(db, "inspectionRequests", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Inspection request not found.");
    const current = {
      id: snap.id,
      ...(snap.data() as Omit<InspectionRequest, "id">),
    };

    let updated = applyInspectionRequestAction(current, action, actor, now);

    // Completing a request records the dated Inspection it produced (atomically
    // with the request update) and links it back, so the Inspectorate's log and
    // the weekly report see the completed inspection.
    if (action.kind === "complete") {
      const batch = writeBatch(db);
      const week = weekLabelForDate(
        action.completedDate,
        weeksSeed as WeekDef[],
        "",
      );
      const inspRef = doc(collection(db, "inspections"));
      const inspection: Inspection = {
        id: inspRef.id,
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
      updated = { ...updated, inspectionId: inspRef.id };
      batch.set(inspRef, stripUndefined(inspection));
      batch.set(ref, stripUndefined(updated), { merge: true });
      await batch.commit();
      return updated;
    }

    await setDoc(ref, stripUndefined(updated), { merge: true });
    return updated;
  }

  async saveLicenceWorkflows(
    items: LicenceWorkflow[],
    uid: string,
    actor?: RequestActor,
  ): Promise<{ saved: number; facilitiesUpdated: number }> {
    const db = requireDb();
    const batch = writeBatch(db);
    const now = new Date().toISOString();
    const weeks = weeksSeed as WeekDef[];
    const noteActor: RequestActor = actor ?? { uid, name: "", section: "" };

    // Deterministic doc id from the RAN so re-importing a dashboard upserts the
    // same application rather than duplicating it.
    const docId = (w: LicenceWorkflow) =>
      (w.ran || w.id).replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();

    // Prior stored records: the automatic history entry for each item needs the
    // previous status to compare against, and step 2's supersede overlay reuses
    // the same list.
    const stored = await this.listLicenceWorkflows();
    const storedById = new Map(stored.map((w) => [w.id, w]));

    const saved = items.map((item) => ({ ...item, updatedAt: now, updatedBy: uid }));
    for (const item of saved) {
      const prior = storedById.get(docId(item));
      const history = workflowHistoryOnSave(prior, item, noteActor, now);
      // The notes trail is append-only: an import payload never writes the array
      // wholesale (that would clobber a comment another officer added since this
      // record was loaded) — new history entries append via arrayUnion and the
      // rest of the record merges as before.
      const payload: Record<string, unknown> = stripUndefined({ ...item });
      delete payload.notes;
      if (history.length) {
        payload.notes = arrayUnion(...history.map((n) => stripUndefined(n)));
      }
      batch.set(doc(db, "licenceWorkflows", docId(item)), payload, {
        merge: true,
      });
    }

    // Workflows in this save that resolved to a real register facility.
    const matched = saved.filter(
      (w) => w.facilityId && !w.facilityName.includes("Unrecognized"),
    );

    let facilitiesUpdated = 0;
    if (matched.length) {
      const facilities = await this.listFacilities();
      // Working copies so an auth append and a stage roll-up on the same facility
      // are merged into a single write.
      const facMap = new Map(facilities.map((f) => [f.id, { ...f }]));
      const dirty = new Set<string>();

      // 1. Issued applications → recorded through the R1–R6 rules. recordLicence
      //    does the right thing per family: a confirmed Use/Possession issuance
      //    flips the facility to officially Licensed and logs the dated licence
      //    event; every other type (import/transit/transfer/variation/export/…) is
      //    recorded as a standalone authorisation the facility holds — it counts
      //    toward the licences issued, but NEVER changes its licensed status.
      for (const w of matched) {
        if (needsTypeClassification(w)) continue; // unclassified FORM-I: held out
        if (w.facilityStage !== "Licence / Certificate Issued") continue;
        if (!w.ran) continue;
        const fac = facMap.get(w.facilityId as string);
        if (!fac) continue;
        // A Use/Possession certificate licenses the facility; an already-licensed
        // one is left to its manual renewal flow (never auto-record a renewal).
        if (isUsePossessionWorkflow(w) && fac.licensed) continue;
        const already = (fac.auths || []).some(
          (a) => a.number && a.number.toUpperCase() === w.ran.toUpperCase(),
        );
        if (already) continue;

        const type = workflowLicenceType(w);
        const eventRef = doc(collection(db, "licenceEvents"));
        const result = recordLicence({
          facility: fac,
          number: w.ran,
          type,
          defaultType: type,
          date: workflowIssueDate(w),
          weeks,
          uid,
          newEventId: eventRef.id,
        });
        batch.set(eventRef, { ...result.event, id: eventRef.id });
        facMap.set(fac.id, result.facilityWrite);
        dirty.add(fac.id);
      }

      // 2. Use/Possession pipeline stage (pre-issuance). The issued case is
      //    handled in step 1, which licenses the facility; here we only roll the
      //    in-flight renewal stage forward. Resolve each matched facility's single
      //    displayed status from the most recent applicable Use/Possession
      //    workflow (stored ∪ just-saved). Standalone authorisations are excluded
      //    so an import/transfer email can never overwrite the renewal stage.
      //    Never downgrade an already-licensed facility.
      const upByFacility = new Map<string, LicenceWorkflow[]>();
      const overlay = new Map<string, LicenceWorkflow>();
      for (const w of stored) overlay.set(w.id, w);
      for (const item of saved) overlay.set(docId(item), item);
      for (const w of overlay.values()) {
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

      // 3. Write each changed facility exactly once.
      for (const facilityId of dirty) {
        const fac = facMap.get(facilityId) as Facility;
        batch.set(
          doc(db, "facilities", facilityId),
          stripUndefined({ ...fac, updatedAt: now, updatedBy: uid }),
          { merge: true },
        );
        facilitiesUpdated++;
      }
    }

    await batch.commit();
    return { saved: items.length, facilitiesUpdated };
  }

  async updateFacility(
    id: string,
    patch: Partial<Facility>,
    uid: string,
  ): Promise<void> {
    const db = requireDb();
    await updateDoc(doc(db, "facilities", id), {
      ...patch,
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    } as any);
  }

  async addFacility(
    f: Omit<Facility, "id">,
    uid: string,
  ): Promise<Facility> {
    const db = requireDb();
    const id = f.facCode
      ? f.facCode.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()
      : doc(collection(db, "facilities")).id;
    const ref = doc(db, "facilities", id);
    const facility: Facility = {
      ...f,
      id,
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    };
    await setDoc(ref, facility);
    return facility;
  }

  async provisionUser(input: {
    email: string;
    displayName: string;
    role: UserDoc["role"];
    section: UserDoc["section"];
    password: string;
  }): Promise<{ uid: string }> {
    // Provisioning a real account needs Admin-SDK privileges (create the Auth
    // user + set custom claims), so it runs in the setUserClaims Cloud Function.
    // The function self-guards: it rejects callers whose token role != "admin".
    const functions = getFbFunctions();
    if (!functions) throw new Error("Firebase Functions are not configured.");
    const { httpsCallable } = await import("firebase/functions");
    const callable = httpsCallable<
      {
        email: string;
        password: string;
        displayName: string;
        role: string;
        section: string;
      },
      { uid: string }
    >(functions, "setUserClaims");
    const res = await callable({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
      role: input.role,
      section: input.section,
    });
    return res.data;
  }

  async setUserDisabled(uid: string, disabled: boolean): Promise<void> {
    const db = requireDb();
    await updateDoc(doc(db, "users", uid), { disabled });
  }

  async exportAll() {
    const [
      facilities,
      licenceEvents,
      inspections,
      inspectionRequests,
      activities,
      licenceWorkflows,
      dailyEntries,
      borders,
      truckScans,
      workPlanNotes,
      workPlanBaseline,
    ] = await Promise.all([
      this.listFacilities(),
      this.listLicenceEvents(),
      this.listInspections(),
      this.listInspectionRequests(),
      this.listActivities(),
      this.listLicenceWorkflows(),
      // Degrade gracefully until the dailyEntries/borders rules are deployed.
      this.listDailyEntries().catch(() => [] as DailyEntry[]),
      this.listBorders().catch(() => [] as Border[]),
      this.listTruckScans().catch(() => [] as TruckScan[]),
      this.listWorkPlanNotes().catch(() => [] as WorkPlanNote[]),
      this.getWorkPlanBaseline(WORK_PLAN_YEAR).catch(() => null),
    ]);
    const db = requireDb();
    const snap = await getDocs(collection(db, "weekMetrics"));
    const weekMetrics: Record<string, WeekMetrics> = {};
    snap.docs.forEach((d) => {
      weekMetrics[d.id] = d.data() as WeekMetrics;
    });
    return {
      facilities,
      licenceEvents,
      inspections,
      inspectionRequests,
      activities,
      licenceWorkflows,
      weekMetrics,
      workPlanNotes,
      workPlanBaseline,
      dailyEntries,
      borders,
      truckScans,
    };
  }
}

export const firebaseStore = new FirebaseStore();
