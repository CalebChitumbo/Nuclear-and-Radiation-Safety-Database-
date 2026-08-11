import type {
  InspectionRequestAction,
  NewInspectionRequestInput,
  RequestActor,
} from "../rules/inspectionRequests";
import type {
  Activity,
  Border,
  DailyEntry,
  DashboardAggregate,
  Facility,
  Inspection,
  InspectionRequest,
  LicenceEvent,
  LicenceWorkflow,
  TruckScan,
  UserDoc,
  WeekDef,
  WeekMetrics,
  WorkflowNote,
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
  /** Applications linked to one facility, most recently updated first. */
  listLicenceWorkflowsFor(facilityId: string): Promise<LicenceWorkflow[]>;
  /**
   * Append an officer comment to an application's notes & history trail,
   * keyed by its RAN (or record id when it has no RAN). Any signed-in officer
   * may comment — the trail is the shared memory between the officers who work
   * on the same application. Appends only; nothing else on the record changes.
   */
  addWorkflowNote(
    ran: string,
    text: string,
    actor: RequestActor,
  ): Promise<WorkflowNote>;
  listUsers(): Promise<UserDoc[]>;
  getAggregate(): Promise<DashboardAggregate>;
  getWeeks(): Promise<WeekDef[]>;
  getWeekMetrics(week: string): Promise<WeekMetrics>;
  /** Every stored week's manual metrics — for cross-week dashboards (NSSS). */
  listWeekMetricsAll(): Promise<WeekMetrics[]>;
  setWeekMetricValue(week: string, key: string, value: number): Promise<void>;
  /** Every daily log entry (Daily Updates tab), newest date first. */
  listDailyEntries(): Promise<DailyEntry[]>;
  addDailyEntry(e: Omit<DailyEntry, "id">): Promise<DailyEntry>;
  deleteDailyEntry(id: string): Promise<void>;
  /**
   * Recent truck scans across the border posts, newest date first. One record
   * per scanned unit — the daily and weekly tallies are derived from these.
   *
   * A busy post logs a few hundred a day, so this is a bounded recent window
   * (see RECENT_SCAN_LIMIT), not the whole history: it backs the pickers and
   * the "last seen" lookups. Anything that must be exact reads a slice —
   * `listTruckScansFor` for a shift, `listTruckScansForWeek` for a report.
   */
  listTruckScans(): Promise<TruckScan[]>;
  /** One post's scans for one day — the shift list on the capture screen. */
  listTruckScansFor(border: string, date: string): Promise<TruckScan[]>;
  /** Every post's scans for one reporting week — the weekly rollup. */
  listTruckScansForWeek(week: string): Promise<TruckScan[]>;
  addTruckScan(s: Omit<TruckScan, "id">): Promise<TruckScan>;
  /**
   * Remove a scan. Correcting one is a remove-and-relog on the capture screen:
   * a scan is a handful of fields typed in seconds, so an edit path would be
   * more UI than the mistake is worth.
   */
  deleteTruckScan(id: string): Promise<void>;
  /** Border posts (active and inactive), name order. */
  listBorders(): Promise<Border[]>;
  /** Add a border post (idempotent on name). NSSS + admin. */
  addBorder(name: string, uid: string): Promise<Border>;
  /** Hide/show a border in the picker without losing its history. */
  setBorderActive(id: string, active: boolean, uid: string): Promise<void>;
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
  /** Every cross-section inspection request, newest first. */
  listInspectionRequests(): Promise<InspectionRequest[]>;
  /** Inspection requests for one facility, newest first (indexed in Firebase). */
  listInspectionRequestsFor(facilityId: string): Promise<InspectionRequest[]>;
  /**
   * Raise a new inspection request (Licensing → Inspectorate). Opens in the
   * "Requested" state with an audit-trail entry.
   */
  addInspectionRequest(
    input: NewInspectionRequestInput,
    actor: RequestActor,
  ): Promise<InspectionRequest>;
  /**
   * Advance a request through its lifecycle (acknowledge / assign / start /
   * complete / close / cancel / comment). Completing one also records the dated
   * Inspection it produced and links it back (`inspectionId`).
   */
  updateInspectionRequest(
    id: string,
    action: InspectionRequestAction,
    actor: RequestActor,
  ): Promise<InspectionRequest>;
  /**
   * Upsert parsed RAIS workflow records (keyed by RAN) and roll each matched
   * facility's stage up onto its facility doc. Returns how many facility stages
   * were updated. Used by the Licensing Status tab. Each record whose visible
   * status changed also gets an automatic history entry appended to its notes
   * trail (workflowHistoryOnSave); pass `actor` so those entries carry the
   * officer's name, not just the uid.
   */
  saveLicenceWorkflows(
    items: LicenceWorkflow[],
    uid: string,
    actor?: RequestActor,
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
    inspectionRequests: InspectionRequest[];
    activities: Activity[];
    licenceWorkflows: LicenceWorkflow[];
    weekMetrics: Record<string, WeekMetrics>;
    dailyEntries: DailyEntry[];
    borders: Border[];
    truckScans: TruckScan[];
  }>;
}
