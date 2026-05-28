import type {
  Activity,
  DashboardAggregate,
  Facility,
  Inspection,
  LicenceEvent,
  UserDoc,
  WeekDef,
  WeekMetrics,
} from "../rules/types";

export interface DataStore {
  ready(): Promise<void>;
  listFacilities(): Promise<Facility[]>;
  listLicenceEvents(): Promise<LicenceEvent[]>;
  listInspections(): Promise<Inspection[]>;
  listActivities(): Promise<Activity[]>;
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
  updateFacility(id: string, patch: Partial<Facility>, uid: string): Promise<void>;
  addFacility(f: Omit<Facility, "id">, uid: string): Promise<Facility>;
  addUser(u: Omit<UserDoc, "uid">): Promise<UserDoc>;
  setUserDisabled(uid: string, disabled: boolean): Promise<void>;
  exportAll(): Promise<{
    facilities: Facility[];
    licenceEvents: LicenceEvent[];
    inspections: Inspection[];
    activities: Activity[];
    weekMetrics: Record<string, WeekMetrics>;
  }>;
}
