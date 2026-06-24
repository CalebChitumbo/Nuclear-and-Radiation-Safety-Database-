"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
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
  type LicenceEvent,
  type LicenceType,
  type LicenceWorkflow,
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

  private async cacheable<T>(_key: string, loader: () => Promise<T>): Promise<T> {
    return loader();
  }

  async listFacilities(): Promise<Facility[]> {
    const db = requireDb();
    const snap = await getDocs(collection(db, "facilities"));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Facility, "id">) }));
  }

  async listLicenceEvents(): Promise<LicenceEvent[]> {
    const db = requireDb();
    const snap = await getDocs(collection(db, "licenceEvents"));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<LicenceEvent, "id">) }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async listInspections(): Promise<Inspection[]> {
    const db = requireDb();
    const snap = await getDocs(collection(db, "inspections"));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Inspection, "id">) }))
      .sort((a, b) => b.date.localeCompare(a.date));
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
    const ref = await addDoc(collection(db, "inspections"), { ...i, week });
    return { ...i, week, id: ref.id };
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

    const saved = items.map((item) => ({ ...item, updatedAt: now, updatedBy: uid }));
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
      const [facilities, stored] = await Promise.all([
        this.listFacilities(),
        this.listLicenceWorkflows(),
      ]);
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
    const [facilities, licenceEvents, inspections, activities, licenceWorkflows] =
      await Promise.all([
        this.listFacilities(),
        this.listLicenceEvents(),
        this.listInspections(),
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
      activities,
      licenceWorkflows,
      weekMetrics,
    };
  }
}

export const firebaseStore = new FirebaseStore();
