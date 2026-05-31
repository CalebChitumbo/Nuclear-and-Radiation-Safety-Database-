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
import { recordLicence } from "../rules/recordLicence";
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

    // Deterministic doc id from the RAN so re-importing a dashboard upserts the
    // same application rather than duplicating it.
    const docId = (w: LicenceWorkflow) =>
      (w.ran || w.id).replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();

    const stageByFacility = new Map<string, Facility["stage"]>();
    for (const item of items) {
      const ref = doc(db, "licenceWorkflows", docId(item));
      batch.set(ref, { ...item, updatedAt: now, updatedBy: uid }, { merge: true });
      if (item.facilityId && !item.facilityName.includes("Unrecognized")) {
        stageByFacility.set(item.facilityId, item.facilityStage);
      }
    }

    // Roll the stage up onto each matched facility (skip already-licensed ones).
    let facilitiesUpdated = 0;
    if (stageByFacility.size) {
      const facilities = await this.listFacilities();
      const facMap = new Map(facilities.map((f) => [f.id, f]));
      for (const [facilityId, stage] of stageByFacility) {
        const fac = facMap.get(facilityId);
        if (fac && !fac.licensed && fac.stage !== stage) {
          batch.set(
            doc(db, "facilities", facilityId),
            { ...fac, stage, updatedAt: now, updatedBy: uid },
            { merge: true },
          );
          facilitiesUpdated++;
        }
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
