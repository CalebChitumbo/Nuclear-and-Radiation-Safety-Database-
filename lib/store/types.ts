import type {
  Activity,
  DashboardAggregate,
  Facility,
  Inspection,
  LicenceEvent,
  LicenceWorkflow,
  UserDoc,
  WeekDef,
  WeekMetrics,
} from "../rules/types";

export interface DataStore {
  ready(): Promise<void>;
  listFacilities(): Promise<Facility[]>;
  /** One facility by id — a single doc read, not a register scan. */
  getFacility(id: string): Promise<Facility | null>;
  listLicenceEvents(): Promise<LicenceEvent[]>;
  /** Events for one facility, newest first (indexed query in Firebase mode). */
  listLicenceEventsFor(facilityId: string): Promise<LicenceEvent[]>;
  listInspections(): Promise<Inspection[]>;
  /** Inspections for one facility, newest first (indexed query in Firebase mode). */
  listInspectionsFor(facilityId: string): Promise<Inspection[]>;
  listActivities(): Promise<Activity[]>;
  listLicenceWorkflows(): Promise<LicenceWorkflow[]>;
  listUsers(): Promise<UserDoc[]>;
  getAggregate(): Promise<DashboardAggregate>;
  getWeeks(): Promise<WeekDef[]>;
  getWeekMetrics(week: string): Promise<WeekMetrics>;
  setWeekMetricValue(week: string, key: string, value: number): Promise<void>;
  addActivity(a: Omit<Activity, "id">): Promise<Activity>;
  updateActivity(id: string, patch: Partial<Activity>): Promise<void>;
  deleteActivity(id: string): Promise<void>;
  recordLicences(
    inputs: Array<{
      facilityId: string | null;
      number: string;
      type: string;
      date: string;
      newFacilityDraft?: Partial<Facility>;
    }>,
    uid: string,
  ): Promise<{
    eventIds: string[];
    facilityIds: string[];
    summary: {
      newLicensed: number;
      renewals: number;
      otherAuths: number;
      skipped: number;
    };
  }>;
  addInspection(i: Omit<Inspection, "id">): Promise<Inspection>;
  /**
   * Upsert parsed RAIS workflow records (keyed by RAN) and roll each matched
   * facility's stage up onto its facility doc. Returns how many facility stages
   * were updated. Used by the Licensing Status tab.
   */
  saveLicenceWorkflows(
    items: LicenceWorkflow[],
    uid: string,
  ): Promise<{ saved: number; facilitiesUpdated: number }>;
  updateFacility(id: string, patch: Partial<Facility>, uid: string): Promise<void>;
  addFacility(f: Omit<Facility, "id">, uid: string): Promise<Facility>;
  provisionUser(input: {
    email: string;
    displayName: string;
    role: UserDoc["role"];
    section: UserDoc["section"];
    password: string;
  }): Promise<{ uid: string }>;
  setUserDisabled(uid: string, disabled: boolean): Promise<void>;
  exportAll(): Promise<{
    facilities: Facility[];
    licenceEvents: LicenceEvent[];
    inspections: Inspection[];
    activities: Activity[];
    licenceWorkflows: LicenceWorkflow[];
    weekMetrics: Record<string, WeekMetrics>;
  }>;
}
