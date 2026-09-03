import type { DailyEntryScope } from "../rules/access";
import type {
  InspectionRequestAction,
  NewInspectionRequestInput,
  RequestActor,
} from "../rules/inspectionRequests";
import type {
  InventoryEdit,
  InventoryEditInput,
  InventoryKind,
} from "../rules/inventoryEdits";
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
  WorkPlanBaseline,
  WorkPlanConfig,
  WorkPlanNote,
  WorkPlanOutputConfig,
  WorkPlanSubprogrammeConfig,
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
  /**
   * Corrections made to the two source inventories. The seeds stay the
   * baseline; this is the overlay the pages merge over them, so it holds only
   * the records someone has actually changed, removed or added.
   */
  listInventoryEdits(): Promise<InventoryEdit[]>;
  /**
   * Save one record's correction, keyed by its identity within its inventory
   * (RAN, or the annex row number). Upserts: saving again replaces the stored
   * patch, so the overlay always says what the record should read now rather
   * than accumulating a history of attempts.
   */
  saveInventoryEdit(
    input: InventoryEditInput,
    actor: RequestActor,
  ): Promise<InventoryEdit>;
  /**
   * Drop a correction entirely, restoring whatever the seed says. This is the
   * undo for an edit — not the same as removing a record, which is a tombstone
   * saved through `saveInventoryEdit`.
   */
  revertInventoryEdit(inventory: InventoryKind, key: string): Promise<void>;
  listUsers(): Promise<UserDoc[]>;
  getAggregate(): Promise<DashboardAggregate>;
  getWeeks(): Promise<WeekDef[]>;
  getWeekMetrics(week: string): Promise<WeekMetrics>;
  /** Every stored week's manual metrics — for cross-week dashboards (NSSS). */
  listWeekMetricsAll(): Promise<WeekMetrics[]>;
  setWeekMetricValue(week: string, key: string, value: number): Promise<void>;
  /**
   * The Status / Comments / Action Points an officer keeps against each work
   * plan output. One document per output id — these belong to the output for
   * the whole plan year, not to a single reporting week.
   */
  listWorkPlanNotes(): Promise<WorkPlanNote[]>;
  /**
   * The opening balance the plan year starts from — what each output had
   * already achieved before the system began counting it. Null when none has
   * been saved, in which case the approved workbook's figures apply.
   */
  getWorkPlanBaseline(year: number): Promise<WorkPlanBaseline | null>;
  /** Replace the plan year's opening balance wholesale. Admins only. */
  setWorkPlanBaseline(
    year: number,
    values: Record<string, number[]>,
    uid: string,
    note?: string,
  ): Promise<void>;
  /**
   * The sections' own changes to the approved plan — reworded outputs, revised
   * targets, rows added or retired, and the register each row counts itself
   * off. Null when nothing has been changed, in which case the plan the code
   * ships with applies in full.
   */
  getWorkPlanConfig(year: number): Promise<WorkPlanConfig | null>;
  /**
   * Save (or clear, with `null`) one row's changes. Writes just that row, so
   * two sections editing their own outputs never overwrite each other.
   */
  setWorkPlanOutputConfig(
    year: number,
    id: string,
    entry: WorkPlanOutputConfig | null,
    uid: string,
  ): Promise<void>;
  /** The same for a subprogramme heading. Admins only. */
  setWorkPlanSubprogrammeConfig(
    year: number,
    id: string,
    entry: WorkPlanSubprogrammeConfig | null,
    uid: string,
  ): Promise<void>;
  /** Drop every change, handing the year back to the approved plan. Admins. */
  resetWorkPlanConfig(year: number, uid: string): Promise<void>;
  setWorkPlanNote(
    id: string,
    patch: Pick<WorkPlanNote, "status" | "comments" | "actionPoints">,
    uid: string,
  ): Promise<void>;
  /**
   * Daily log entries (Daily Updates tab), newest date first. Pass the scope
   * the account is entitled to — its section, and for a posted officer their
   * post — see dailyEntryScope in lib/rules/access.ts. The security rules
   * refuse a wider read than the account's claims allow, so a section officer
   * asking for every entry gets a permission error, not the department's log.
   */
  listDailyEntries(scope?: DailyEntryScope): Promise<DailyEntry[]>;
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
   *
   * A posted officer reads their own post and no other, so they pass it; the
   * rules refuse the unscoped read from such an account.
   */
  listTruckScans(border?: string): Promise<TruckScan[]>;
  /** One post's scans for one day — the shift list on the capture screen. */
  listTruckScansFor(border: string, date: string): Promise<TruckScan[]>;
  /**
   * Scans for one reporting week — every post's for the weekly rollup, or
   * one post's when the reader is posted there.
   */
  listTruckScansForWeek(week: string, border?: string): Promise<TruckScan[]>;
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
    /** Inland office an NSSS officer is posted to. */
    border?: string;
    /** The administrator doing the provisioning (registers the office, if new). */
    actorUid: string;
  }): Promise<{ uid: string }>;
  /**
   * One account document. An officer may read their own (that is how the
   * "waiting for approval" screen knows what was asked for); everything else is
   * admin-only, so this is not a way around listUsers.
   */
  getUser(uid: string): Promise<UserDoc | null>;
  /**
   * File a self-service account request against an already-created sign-in.
   * The document is written `pending`, which is what withholds every claim —
   * see newAccountRequest in lib/rules/signup.ts.
   */
  requestAccount(request: UserDoc): Promise<UserDoc>;
  /**
   * Approve a pending request, with whatever the administrator settled on for
   * its role, section and inland office. Granting the claims is the Cloud
   * Function's job (onUserDocWrite) — this only clears `pending`. When the
   * office named is not yet in the border register it is added, so approving an
   * officer at a new post registers the post at the same time.
   */
  approveUser(
    uid: string,
    decision: {
      role: UserDoc["role"];
      section: UserDoc["section"];
      border?: string;
    },
    actorUid: string,
  ): Promise<void>;
  /** Turn a request down. The account stays, disabled, so it cannot re-apply. */
  declineUser(uid: string): Promise<void>;
  setUserDisabled(uid: string, disabled: boolean): Promise<void>;
  exportAll(): Promise<{
    facilities: Facility[];
    licenceEvents: LicenceEvent[];
    inspections: Inspection[];
    inspectionRequests: InspectionRequest[];
    activities: Activity[];
    licenceWorkflows: LicenceWorkflow[];
    weekMetrics: Record<string, WeekMetrics>;
    workPlanNotes: WorkPlanNote[];
    workPlanBaseline: WorkPlanBaseline | null;
    workPlanConfig: WorkPlanConfig | null;
    dailyEntries: DailyEntry[];
    borders: Border[];
    truckScans: TruckScan[];
    inventoryEdits: InventoryEdit[];
  }>;
}
