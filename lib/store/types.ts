import type {
  CommitteeAction,
  CommitteeActor,
  NewCommitteeSubmissionInput,
} from "../rules/committee";
import type { FormIIAction, FormIIActor, NewFormIIInput } from "../rules/formII";
import type {
  InspectionRequestAction,
  NewInspectionRequestInput,
  RequestActor,
} from "../rules/inspectionRequests";
import type {
  Activity,
  CommitteeSubmission,
  DashboardAggregate,
  Facility,
  FurtherParticularsRecord,
  Inspection,
  InspectionRequest,
  LicenceEvent,
  LicenceWorkflow,
  ReconciliationRecord,
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
   * Inspection it produced and links it back (`inspectionId`). Closing a
   * pre-authorisation request with a SATISFACTORY outcome also files a
   * CommitteeSubmission (the SOP's gate → TECHCOM handoff).
   */
  updateInspectionRequest(
    id: string,
    action: InspectionRequestAction,
    actor: RequestActor,
  ): Promise<InspectionRequest>;
  /**
   * The TECHCOM / Board queue — the digital "complete applications awaiting
   * TECHCOM" file. Newest first.
   */
  listCommitteeSubmissions(): Promise<CommitteeSubmission[]>;
  addCommitteeSubmission(
    input: NewCommitteeSubmissionInput,
    actor: CommitteeActor,
  ): Promise<CommitteeSubmission>;
  /** TECHCOM/Board decisions, issuance, rejection (Form III), comments. */
  updateCommitteeSubmission(
    id: string,
    action: CommitteeAction,
    actor: CommitteeActor,
  ): Promise<CommitteeSubmission>;
  /** Form II (further particulars) tracker, newest first. */
  listFurtherParticulars(): Promise<FurtherParticularsRecord[]>;
  addFurtherParticulars(
    input: NewFormIIInput,
    actor: FormIIActor,
  ): Promise<FurtherParticularsRecord>;
  updateFurtherParticulars(
    id: string,
    action: FormIIAction,
    actor: FormIIActor,
  ): Promise<FurtherParticularsRecord>;
  /**
   * Upsert parsed RAIS workflow records (keyed by RAN) and roll each matched
   * facility's stage up onto its facility doc. Returns how many facility stages
   * were updated. Used by the Licensing Status tab.
   */
  saveLicenceWorkflows(
    items: LicenceWorkflow[],
    uid: string,
  ): Promise<{ saved: number; facilitiesUpdated: number }>;
  /**
   * Patch one tracked application (checklist ticks, completeness date). An
   * `undefined` value clears that field.
   */
  updateLicenceWorkflow(
    id: string,
    patch: Partial<LicenceWorkflow>,
    uid: string,
  ): Promise<void>;
  /** Monthly Accounts reconciliation checklist (SOP: by the 5th). */
  listReconciliations(): Promise<ReconciliationRecord[]>;
  setReconciliation(rec: ReconciliationRecord, uid: string): Promise<void>;
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
    committeeSubmissions: CommitteeSubmission[];
    furtherParticulars: FurtherParticularsRecord[];
    activities: Activity[];
    licenceWorkflows: LicenceWorkflow[];
    weekMetrics: Record<string, WeekMetrics>;
  }>;
}
