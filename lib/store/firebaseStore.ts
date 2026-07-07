"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
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
import {
  applyCommitteeAction,
  buildCommitteeSubmission,
  type CommitteeAction,
  type CommitteeActor,
  type NewCommitteeSubmissionInput,
} from "../rules/committee";
import { detectType } from "../rules/detectType";
import {
  applyFormIIAction,
  buildFurtherParticulars,
  type FormIIAction,
  type FormIIActor,
  type NewFormIIInput,
} from "../rules/formII";
import {
  applyInspectionRequestAction,
  buildInspectionRequest,
  type InspectionRequestAction,
  type NewInspectionRequestInput,
  type RequestActor,
} from "../rules/inspectionRequests";
import { inspectionGate, raisDateToISO } from "../rules/sla";
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
  type CommitteeSubmission,
  type DashboardAggregate,
  type Facility,
  type FurtherParticularsRecord,
  type Inspection,
  type InspectionRequest,
  type LicenceEvent,
  type LicenceType,
  type LicenceWorkflow,
  type ReconciliationRecord,
  type UserDoc,
  type WeekDef,
  type WeekMetrics,
  isUseP,
} from "../rules/types";
import { weekLabelForDate } from "../rules/week";
import type { DataStore } from "./types";
import weeksSeed from "../../seed/weeks-2026.seed.json";

function requireDb(): Firestore {
  const db = getDb();
  if (!db) throw new Error("Firestore is not configured.");
  return db;
}

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

    // The SOP's verification gate: closing a pre-authorisation request whose
    // inspection came back SATISFACTORY files the application for TECHCOM (the
    // digital "awaiting TECHCOM" file), atomically with the close. Idempotent —
    // a request files at most one submission.
    if (
      action.kind === "close" &&
      current.type === "Pre-Authorisation" &&
      inspectionGate(current.outcome)?.satisfactory
    ) {
      const existing = await getDocs(
        query(
          collection(db, "committeeSubmissions"),
          where("inspectionRequestId", "==", id),
        ),
      );
      if (existing.empty) {
        const batch = writeBatch(db);
        const subRef = doc(collection(db, "committeeSubmissions"));
        const draft = buildCommitteeSubmission(
          {
            ran: current.workflowRan,
            facilityId: current.facilityId,
            facilityName: current.facilityName,
            facCode: current.facCode,
            province: current.province,
            sector: current.sector,
            inspectionRequestId: id,
            inspectionOutcome: current.outcome,
            reportRef: current.reportRef,
          },
          { uid: actor.uid, name: actor.name },
          now,
        );
        batch.set(subRef, stripUndefined({ ...draft, id: subRef.id }));
        batch.set(ref, stripUndefined(updated), { merge: true });
        await batch.commit();
        return updated;
      }
    }

    await setDoc(ref, stripUndefined(updated), { merge: true });
    return updated;
  }

  async listCommitteeSubmissions(): Promise<CommitteeSubmission[]> {
    const db = requireDb();
    const snap = await getDocs(collection(db, "committeeSubmissions"));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<CommitteeSubmission, "id">) }))
      .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));
  }

  async addCommitteeSubmission(
    input: NewCommitteeSubmissionInput,
    actor: CommitteeActor,
  ): Promise<CommitteeSubmission> {
    const db = requireDb();
    const now = new Date().toISOString();
    const ref = doc(collection(db, "committeeSubmissions"));
    const submission: CommitteeSubmission = {
      ...buildCommitteeSubmission(input, actor, now),
      id: ref.id,
    };
    await setDoc(ref, stripUndefined(submission));
    return submission;
  }

  async updateCommitteeSubmission(
    id: string,
    action: CommitteeAction,
    actor: CommitteeActor,
  ): Promise<CommitteeSubmission> {
    const db = requireDb();
    const ref = doc(db, "committeeSubmissions", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Committee submission not found.");
    const current = {
      id: snap.id,
      ...(snap.data() as Omit<CommitteeSubmission, "id">),
    };
    const updated = applyCommitteeAction(
      current,
      action,
      actor,
      new Date().toISOString(),
    );
    await setDoc(ref, stripUndefined(updated), { merge: true });
    return updated;
  }

  async listFurtherParticulars(): Promise<FurtherParticularsRecord[]> {
    const db = requireDb();
    const snap = await getDocs(collection(db, "furtherParticulars"));
    return snap.docs
      .map(
        (d) =>
          ({ id: d.id, ...(d.data() as Omit<FurtherParticularsRecord, "id">) }),
      )
      .sort((a, b) => (b.issuedDate || "").localeCompare(a.issuedDate || ""));
  }

  async addFurtherParticulars(
    input: NewFormIIInput,
    actor: FormIIActor,
  ): Promise<FurtherParticularsRecord> {
    const db = requireDb();
    const now = new Date().toISOString();
    const ref = doc(collection(db, "furtherParticulars"));
    const record: FurtherParticularsRecord = {
      ...buildFurtherParticulars(input, actor, now),
      id: ref.id,
    };
    await setDoc(ref, stripUndefined(record));
    return record;
  }

  async updateFurtherParticulars(
    id: string,
    action: FormIIAction,
    actor: FormIIActor,
  ): Promise<FurtherParticularsRecord> {
    const db = requireDb();
    const ref = doc(db, "furtherParticulars", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Form II record not found.");
    const current = {
      id: snap.id,
      ...(snap.data() as Omit<FurtherParticularsRecord, "id">),
    };
    const updated = applyFormIIAction(
      current,
      action,
      actor,
      new Date().toISOString(),
    );
    await setDoc(ref, stripUndefined(updated), { merge: true });
    return updated;
  }

  async updateLicenceWorkflow(
    id: string,
    patch: Partial<LicenceWorkflow>,
    uid: string,
  ): Promise<void> {
    const db = requireDb();
    // A key explicitly present with an `undefined` value clears that field
    // (e.g. completeReceivedAt when the checklist stops being complete) — the
    // web SDK needs deleteField() for that, and merge keeps everything else.
    const write: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    };
    for (const [k, v] of Object.entries(patch)) {
      write[k] = v === undefined ? deleteField() : v;
    }
    await setDoc(doc(db, "licenceWorkflows", id), write, { merge: true });
  }

  async listReconciliations(): Promise<ReconciliationRecord[]> {
    const db = requireDb();
    const snap = await getDocs(collection(db, "reconciliations"));
    return snap.docs
      .map((d) => d.data() as ReconciliationRecord)
      .sort((a, b) => b.month.localeCompare(a.month));
  }

  async setReconciliation(
    rec: ReconciliationRecord,
    _uid: string,
  ): Promise<void> {
    const db = requireDb();
    await setDoc(doc(db, "reconciliations", rec.month), stripUndefined(rec));
  }

  async saveLicenceWorkflows(
    items: LicenceWorkflow[],
    uid: string,
  ): Promise<{ saved: number; facilitiesUpdated: number }> {
    const db = requireDb();
    const batch = writeBatch(db);
    const now = new Date().toISOString();
    const weeks = weeksSeed as WeekDef[];

    // Deterministic doc id from the RAN so re-importing a dashboard upserts the
    // same application rather than duplicating it.
    const docId = (w: LicenceWorkflow) =>
      (w.ran || w.id).replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();

    // Loaded up front (not just for the matched-facility roll-up below): the
    // prior doc decides whether firstSeen — the fallback start of the SOP's
    // 44-working-day clock — is already stamped. Merge writes preserve every
    // other prior field (officerType, checklist, completeReceivedAt) for free.
    const stored = await this.listLicenceWorkflows();
    const priorById = new Map(stored.map((w) => [w.id, w]));

    const saved = items.map((item) => {
      const prior = priorById.get(docId(item));
      return {
        ...item,
        firstSeen:
          prior?.firstSeen ??
          item.firstSeen ??
          item.receivedAt?.slice(0, 10) ??
          raisDateToISO(item.lastSeen) ??
          now.slice(0, 10),
        updatedAt: now,
        updatedBy: uid,
      };
    });
    for (const item of saved) {
      batch.set(doc(db, "licenceWorkflows", docId(item)), stripUndefined(item), {
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
      committeeSubmissions,
      furtherParticulars,
      activities,
      licenceWorkflows,
    ] = await Promise.all([
      this.listFacilities(),
      this.listLicenceEvents(),
      this.listInspections(),
      this.listInspectionRequests(),
      this.listCommitteeSubmissions().catch(
        () => [] as CommitteeSubmission[],
      ),
      this.listFurtherParticulars().catch(
        () => [] as FurtherParticularsRecord[],
      ),
      this.listActivities(),
      this.listLicenceWorkflows(),
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
      committeeSubmissions,
      furtherParticulars,
      activities,
      licenceWorkflows,
      weekMetrics,
    };
  }
}

export const firebaseStore = new FirebaseStore();
