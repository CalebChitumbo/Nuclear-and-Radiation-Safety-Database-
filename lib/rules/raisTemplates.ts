/**
 * RAIS email-template → status mapping (the authoritative source of truth).
 *
 * The Radiation Protection Authority receives an automated email from RAIS
 * (eLicensing@rpa.gov.zm) every time an application changes stage. Each email
 * corresponds to one of the templates in the RPA "Licensing Process" sheet
 * (rais-email-status-mapping.csv). The **email subject** is the reliable primary
 * match key; the canonical `NewApplicationStatus` is the status a facility must
 * show after that email.
 *
 * This module is pure and framework-free (no React/Firebase) so it can be shared
 * by the web paste parser AND copied into the Cloud Functions bundle by
 * functions/scripts/sync-rules.js. It only imports *types* from ./types, so there
 * is no runtime import cycle even though ./types re-exports NewApplicationStatus.
 */
import type { Stage, WorkflowPhase, WorkflowPriority } from "./types";

// ---------------------------------------------------------------------------
// Canonical status taxonomy
// ---------------------------------------------------------------------------

/**
 * Every distinct canonical status from the sheet's `NewApplicationStatus`
 * column (trimmed), mapped to the coarse `Stage` enum the dashboard aggregates
 * (`byStage`) and the StatusPill key off. Defining the statuses here — once —
 * makes this the single place a status string lives; `NewApplicationStatus`
 * (the closed union) is derived from these keys, so the template table and the
 * rest of the app are type-checked against it.
 */
export const STATUS_TO_STAGE = {
  // --- Review & Assessment (applicant/licensee must act) -------------------
  "Additional Information Required (R&A) - Assigned to Licensee":
    "Under Internal Review (Further Information Required)",
  "Improvement Actions Required (R&A) - Applicant to act":
    "Under Internal Review (Further Information Required)",
  "Review Remarks Issued - Applicant to act":
    "Under Internal Review (Further Information Required)",
  // --- Approvals (CEO / Board) ---------------------------------------------
  "Pending Board Approval (FORM I)": "Board Licence Approval Required",
  "Pending Board Approval (Variation of Terms)": "Board Licence Approval Required",
  "Pending CEO Approval (FORM I)": "CEO Licence Approval Required",
  "Pending CEO Approval (Variation of Terms)": "CEO Licence Approval Required",
  "CEO approval pending": "CEO Licence Approval Required",
  // --- Authorization terms / conditions issued -----------------------------
  "Issuance of conditions": "Authorization Terms Issued",
  // --- Invoice / payment chain ---------------------------------------------
  "Invoice Request Generation Pending": "Invoice Generation Pending",
  "Invoice Request Required - Applicant to generate & upload invoice request":
    "Invoice Generation Pending",
  "Payment Pending - Awaiting Proof of Payment (POP) from Applicant":
    "Waiting for Payment",
  "Invoice Issued to Applicant - Awaiting Proof of Payment (POP)":
    "Waiting for Payment",
  // --- Intake / draft ------------------------------------------------------
  "Draft Application": "Draft Application",
  "Import Application Received": "Draft Application",
  "Decommissioning Notice Form Assigned - Pending action": "Application Submitted",
  "Data Form Assigned - Pending action by assigned party (stage = data-form name)":
    "Under Review and Assessment",
  "Workflow Amended - New instance created": "Application Submitted",
  "Workflow Renewed - New instance created": "Application Submitted",
  // --- Approved / licence (or certificate) issued --------------------------
  "Licence Approved": "Licence / Certificate Issued",
  "Licence Approved (Use) - Licence available": "Licence / Certificate Issued",
  "Renewal Licence Approved - Licences can be downloaded":
    "Licence / Certificate Issued",
  "Variation Approved - Licence available for download":
    "Licence / Certificate Issued",
  "Transfer Approved - Certificate available": "Licence / Certificate Issued",
  // --- Resets: rejected / returned / revisit / declined / withdrawn --------
  "Import Application Rejected": "Application Returned / Rejected",
  "Variation Application Rejected": "Application Returned / Rejected",
  "Transfer Application Rejected": "Application Returned / Rejected",
  "Renewal Application Rejected": "Application Returned / Rejected",
  "Application Rejected (Use)": "Application Returned / Rejected",
  "Review & Assessment Rejected - Returned for correction":
    "Application Returned / Rejected",
  "R&A Report Rejected - Returned to author": "Application Returned / Rejected",
  "Application Incomplete (Import) - Returned to Applicant":
    "Application Returned / Rejected",
  "Application Incomplete (Variation) - Returned to Applicant":
    "Application Returned / Rejected",
  "Application Incomplete (Renewal) - Returned to Applicant":
    "Application Returned / Rejected",
  "Application Incomplete (Transfer) - Returned to Applicant":
    "Application Returned / Rejected",
  "Application Incomplete (FORM I) - Returned to Applicant":
    "Application Returned / Rejected",
  "Authorization Terms Returned for Revisit (Import)":
    "Application Returned / Rejected",
  "Authorization Terms Returned for Revisit (Variation)":
    "Application Returned / Rejected",
  "Authorization Terms Returned for Revisit (Renewal)":
    "Application Returned / Rejected",
  "Authorization Terms Returned for Revisit (Transfer)":
    "Application Returned / Rejected",
  "Authorization Terms Returned for Revisit (Use)":
    "Application Returned / Rejected",
  "Terms Declined by Licensee (Import) - Authority to review":
    "Application Returned / Rejected",
  "Terms Declined by Licensee (Variation) - Authority to review":
    "Application Returned / Rejected",
  "Terms Declined by Licensee (Renewal) - Authority to review":
    "Application Returned / Rejected",
  "Terms Declined by Licensee (Transfer) - Authority to review":
    "Application Returned / Rejected",
  "Terms Declined by Licensee (Use) - Authority to review":
    "Application Returned / Rejected",
  "Workflow Withdrawn": "Application Returned / Rejected",
  // --- Expiry / renewal reminders (apply to already-licensed facilities) ---
  "Import Expiring - Renewal Reminder": "Licence Expiring (Renewal Due)",
  "Variation Expiring - Renewal Reminder": "Licence Expiring (Renewal Due)",
  "Transfer Expiring - Renewal Reminder": "Licence Expiring (Renewal Due)",
  "Licence Expiring - Renewal Reminder (with steps)": "Licence Expiring (Renewal Due)",
  "Licence Expiring - Renewal Reminder (Use)": "Licence Expiring (Renewal Due)",
} satisfies Record<string, Stage>;

export type NewApplicationStatus = keyof typeof STATUS_TO_STAGE;

export const NEW_APPLICATION_STATUSES = Object.keys(
  STATUS_TO_STAGE,
) as NewApplicationStatus[];

/**
 * Statuses whose `Stage` is a best-effort proxy rather than an exact home (the
 * sheet's value doesn't map cleanly onto the coarse enum). Pinned by a test so
 * any future change is a deliberate review, per the spec's "flag any status
 * that doesn't cleanly map".
 */
export const UNCLEAN_STATUSES: NewApplicationStatus[] = [
  "Data Form Assigned - Pending action by assigned party (stage = data-form name)",
  "Workflow Amended - New instance created",
  "Workflow Renewed - New instance created",
  "Decommissioning Notice Form Assigned - Pending action",
];

// ---------------------------------------------------------------------------
// Normalization + RAN family helpers
// ---------------------------------------------------------------------------

/**
 * Normalize an email subject (or distinctive body phrase) for matching:
 * lowercase → strip punctuation → collapse whitespace → trim. Deliberately does
 * NOT strip company suffixes the way matching.ts:norm does (that is for facility
 * names; here it would mangle template subjects).
 */
export function normalizeSubject(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Coarse RAN family used to disambiguate near-identical templates (notably the
 * two "…Licence Application Approved" subjects that differ only by "Renewal").
 */
export function ranHint(
  ran: string,
): "USE" | "USE.REN" | "TRF" | "VAR" | "IMP" | null {
  const s = (ran || "").toUpperCase();
  if (/USE\.REN|\bREN\b/.test(s)) return "USE.REN";
  if (/USE/.test(s)) return "USE";
  if (/TRF|TRANSF/.test(s)) return "TRF";
  if (/VAR/.test(s)) return "VAR";
  if (/IMP/.test(s)) return "IMP";
  return null;
}

// ---------------------------------------------------------------------------
// The template table
// ---------------------------------------------------------------------------

export interface RaisTemplate {
  /** Source row number in rais-email-status-mapping.csv (traceability). */
  sr: number;
  /** TemplateName (= email subject) — the reliable primary match key. */
  subject: string;
  /** Precomputed normalizeSubject(subject). */
  subjectNorm: string;
  /** Canonical status the facility/application must show after this email. */
  status: NewApplicationStatus;
  /** Coarse Stage for byStage aggregates + facility roll-up (= STATUS_TO_STAGE[status]). */
  stage: Stage;
  phase: WorkflowPhase;
  priority: WorkflowPriority;
  responsibleParty: string;
  /** Yes = routinely received (29 rows). Tune/test these first. */
  commonlyReceived: boolean;
  /** First non-generic body line — corroboration/fallback when subject is missing. */
  bodyPhrase?: string;
  bodyPhraseNorm?: string;
  /** Tie-break hint for near-identical templates. */
  ranTypeHint?: "USE" | "USE.REN" | "TRF" | "VAR" | "IMP";
  outstandingPayment?: boolean;
  clearsPayment?: boolean;
  bottleneck?: boolean;
  /** The two licence-issuing cases and the resets (§3/§4 of the spec). */
  special?: "renewal-auto" | "form-i-prompt" | "reset";
  /**
   * The master "Workflow Assignment" template, whose real stage lives in the
   * body's data-form name — classifyEmail defers these to the legacy RULES.
   */
  generic?: boolean;
}

const PHASE_DEFAULTS: Record<
  WorkflowPhase,
  { priority: WorkflowPriority; responsibleParty: string }
> = {
  Application: { priority: "APPLICANT", responsibleParty: "Applicant" },
  Payment: { priority: "APPLICANT", responsibleParty: "Applicant" },
  "Accounts Clearance": { priority: "HIGH", responsibleParty: "Accounts Officer" },
  "RPA Receipt": { priority: "NORMAL", responsibleParty: "NRSO" },
  "Review & Assessment": { priority: "HIGH", responsibleParty: "NRSO" },
  "Authorization / Conditions": { priority: "NORMAL", responsibleParty: "NRSO" },
  "Approval (CEO/Board)": { priority: "CRITICAL", responsibleParty: "CEO" },
  "Licence Issued": { priority: "NORMAL", responsibleParty: "NRSO" },
  Inspection: { priority: "NORMAL", responsibleParty: "Inspection Team" },
  Other: { priority: "HIGH", responsibleParty: "NRSO" },
};

type TplExtra = Partial<
  Pick<
    RaisTemplate,
    | "priority"
    | "responsibleParty"
    | "ranTypeHint"
    | "outstandingPayment"
    | "clearsPayment"
    | "bottleneck"
    | "special"
    | "generic"
    | "bodyPhrase"
  >
>;

function tpl(
  sr: number,
  subject: string,
  status: NewApplicationStatus,
  commonlyReceived: boolean,
  phase: WorkflowPhase,
  extra: TplExtra = {},
): RaisTemplate {
  const d = PHASE_DEFAULTS[phase];
  return {
    sr,
    subject,
    subjectNorm: normalizeSubject(subject),
    status,
    stage: STATUS_TO_STAGE[status],
    phase,
    priority: extra.priority ?? d.priority,
    responsibleParty: extra.responsibleParty ?? d.responsibleParty,
    commonlyReceived,
    bodyPhrase: extra.bodyPhrase,
    bodyPhraseNorm: extra.bodyPhrase ? normalizeSubject(extra.bodyPhrase) : undefined,
    ranTypeHint: extra.ranTypeHint,
    outstandingPayment: extra.outstandingPayment,
    clearsPayment: extra.clearsPayment,
    bottleneck: extra.bottleneck,
    special: extra.special,
    generic: extra.generic,
  };
}

/** All 64 templates (29 commonly received + 35 rare), in source-row order. */
export const RAIS_TEMPLATES: RaisTemplate[] = [
  tpl(7, "Additional Information Required", "Additional Information Required (R&A) - Assigned to Licensee", true, "Review & Assessment", { responsibleParty: "Licensee", special: "reset", bodyPhrase: "requires additional information to proceed with the Review and Assessment Process" }),
  tpl(14, "BOARD APPROVAL REQUEST OF IONISING RADIATION LICENCE", "Pending Board Approval (FORM I)", true, "Approval (CEO/Board)", { responsibleParty: "Board", bodyPhrase: "BOARD approval data form" }),
  tpl(15, "BOARD APPROVAL VARIATION OF TERMS FOR IONISING RADIATION LICENCE", "Pending Board Approval (Variation of Terms)", true, "Approval (CEO/Board)", { responsibleParty: "Board", ranTypeHint: "VAR" }),
  tpl(16, "CEO APPROVAL REQUEST IONISING RADIATION LICENCE", "Pending CEO Approval (FORM I)", true, "Approval (CEO/Board)", { bodyPhrase: "CEO approval data form" }),
  tpl(17, "CEO APPROVAL VARIATION OF TERMS FOR IONISING RADIATION LICENCE", "Pending CEO Approval (Variation of Terms)", true, "Approval (CEO/Board)", { ranTypeHint: "VAR" }),
  tpl(18, "CEO APPROVAL VARIATION OF TERMS FOR IONISING RADIATION LICENCE", "Pending CEO Approval (Variation of Terms)", true, "Approval (CEO/Board)", { ranTypeHint: "VAR" }),
  tpl(38, "Import Authorization - Declination of Authorization Terms", "Terms Declined by Licensee (Import) - Authority to review", false, "Authorization / Conditions", { special: "reset" }),
  tpl(39, "Import Authorization - Issue of Authorization Terms", "Issuance of conditions", false, "Authorization / Conditions", { ranTypeHint: "IMP" }),
  tpl(40, "Import Authorization - Revisit Authorization Terms", "Authorization Terms Returned for Revisit (Import)", false, "Authorization / Conditions", { special: "reset" }),
  tpl(41, "Import Authorization Application Approved", "Licence Approved", false, "Licence Issued", { ranTypeHint: "IMP", bodyPhrase: "Your Application for Import Ionising Radiation Licence has been Approved" }),
  tpl(42, "Import Authorization Application Rejected", "Import Application Rejected", false, "Other", { special: "reset" }),
  tpl(43, "Import Authorization Expiry", "Import Expiring - Renewal Reminder", false, "Application", { responsibleParty: "Licensee" }),
  tpl(44, "Improvement Actions Required", "Improvement Actions Required (R&A) - Applicant to act", true, "Review & Assessment", { responsibleParty: "Applicant", special: "reset", bodyPhrase: "Regulatory Authority has specified Improvement Actions" }),
  tpl(47, "Incomplete Import Authorization Application", "Application Incomplete (Import) - Returned to Applicant", false, "Application", { special: "reset" }),
  tpl(48, "Incomplete Isotope Production Authorization Application", "Application Incomplete (Variation) - Returned to Applicant", false, "Application", { special: "reset" }),
  tpl(50, "Incomplete Storage Authorization Application", "Application Incomplete (Renewal) - Returned to Applicant", false, "Application", { special: "reset" }),
  tpl(51, "Incomplete Transfer Authorization Application", "Application Incomplete (Transfer) - Returned to Applicant", false, "Application", { special: "reset" }),
  tpl(53, "Incomplete Use Authorization Application", "Application Incomplete (FORM I) - Returned to Applicant", false, "Application", { special: "reset" }),
  tpl(58, "INVOICE REQUEST GENERATOR", "Invoice Request Required - Applicant to generate & upload invoice request", true, "Payment", { bodyPhrase: "An official invoice request is required for this application" }),
  tpl(59, "Ionising Radiation Licence Variation of Terms Application Approved", "Variation Approved - Licence available for download", true, "Licence Issued", { ranTypeHint: "VAR", bodyPhrase: "Your Application for Licence variation of terms has been Approved" }),
  tpl(60, "Isotope Production - Revisit Authorization Terms", "Authorization Terms Returned for Revisit (Variation)", false, "Authorization / Conditions", { special: "reset" }),
  tpl(61, "Isotope Production Authorization - Declination of Authorization Terms", "Terms Declined by Licensee (Variation) - Authority to review", false, "Authorization / Conditions", { special: "reset" }),
  tpl(62, "Authorization Terms for Variation of Terms Application", "Issuance of conditions", true, "Authorization / Conditions", { ranTypeHint: "VAR", bodyPhrase: "the Radiation Protection Authority has issued Licence Terms for your application" }),
  tpl(63, "Isotope Production Authorization Application Rejected", "Variation Application Rejected", false, "Other", { special: "reset" }),
  tpl(64, "Isotope Production Authorization Expiry", "Variation Expiring - Renewal Reminder", false, "Application", { responsibleParty: "Licensee" }),
  tpl(67, "New Import Auth request received", "Import Application Received", false, "Application", { bodyPhrase: "A new Import Authorization Request has been received" }),
  tpl(68, "New Variation of Terms Application received", "Draft Application", true, "Application", { ranTypeHint: "VAR", bodyPhrase: "A new variation of terms application has been received" }),
  tpl(70, "New licence renewal application request for Use or Possession received", "Draft Application", true, "Application", { ranTypeHint: "USE.REN", bodyPhrase: "A Renewal application for Use or Possession has been received" }),
  tpl(71, "New Transfer Authorization request received", "Draft Application", true, "Application", { ranTypeHint: "TRF", bodyPhrase: "A new Transfer Authorization Request has been received" }),
  tpl(73, "New FORM I  Application request received", "Draft Application", true, "Application", { ranTypeHint: "USE", bodyPhrase: "A new licence application request has been received" }),
  tpl(74, "NOTICE OF INTENTION TO DECOMMISSION RADIOACTIVE DEVICE", "Decommissioning Notice Form Assigned - Pending action", true, "Application", { responsibleParty: "Licensee", bodyPhrase: "Notice of intention to decomission radioactive device form" }),
  tpl(75, "Payment Pending", "Payment Pending - Awaiting Proof of Payment (POP) from Applicant", true, "Payment", { outstandingPayment: true, bodyPhrase: "Your payment for Ionising Radiation Licence application having RAN" }),
  tpl(90, "Review and Assessment Rejected", "Review & Assessment Rejected - Returned for correction", false, "Review & Assessment", { special: "reset" }),
  tpl(91, "Review and Assessment Report Rejected", "R&A Report Rejected - Returned to author", false, "Review & Assessment", { special: "reset" }),
  tpl(100, "Simple Authorization Review Remarks", "Review Remarks Issued - Applicant to act", false, "Review & Assessment", { responsibleParty: "Licensee", special: "reset" }),
  tpl(107, "Storage Authorization - Declination of Authorization Terms", "Terms Declined by Licensee (Renewal) - Authority to review", false, "Authorization / Conditions", { special: "reset" }),
  tpl(108, "Conditions for Ionising Radiation Licence Application", "CEO approval pending", true, "Approval (CEO/Board)", { bodyPhrase: "Radiation Protection Authority has issued Conditions for your licence application" }),
  tpl(109, "Storage Authorization - Revisit Authorization Terms", "Authorization Terms Returned for Revisit (Renewal)", false, "Authorization / Conditions", { special: "reset" }),
  tpl(110, "Renewal Ionising Radiation Licence Application Approved", "Renewal Licence Approved - Licences can be downloaded", true, "Licence Issued", { ranTypeHint: "USE.REN", special: "renewal-auto", bodyPhrase: "Your Application for a renewal Ionising Radiation Licence has been Approved" }),
  tpl(111, "Storage Authorization Application Rejected", "Renewal Application Rejected", false, "Other", { special: "reset" }),
  tpl(112, "Storage Authorization Expiry", "Licence Expiring - Renewal Reminder (with steps)", false, "Application", { responsibleParty: "Licensee" }),
  tpl(113, "Submission of Renewal application Request", "Invoice Request Generation Pending", true, "Payment", { bodyPhrase: "An Authorization Request has been submitted for following sources" }),
  tpl(116, "Submission of Authorization Request - Import", "Invoice Request Generation Pending", false, "Payment", { ranTypeHint: "IMP", bodyPhrase: "Your Authorization Request for Import has been submitted successfully" }),
  tpl(117, "Variation of Terms Request Submitted successfully", "Invoice Request Generation Pending", true, "Payment", { ranTypeHint: "VAR", bodyPhrase: "Your Authorization Request for Variation of Terms has been submitted successfully" }),
  tpl(119, "Renewal Ionising Radiation Licence Request Submitted successfully", "Invoice Request Generation Pending", true, "Payment", { ranTypeHint: "USE.REN", bodyPhrase: "Your application request for Renewal has been submitted successfully" }),
  tpl(120, "Transfer Authorization Request Submitted successfully", "Invoice Request Generation Pending", true, "Payment", { ranTypeHint: "TRF", bodyPhrase: "Your Authorization Request for Transfer has been submitted successfully" }),
  tpl(122, "Use or Possession Licence Application Request Submitted successfully", "Invoice Request Generation Pending", true, "Payment", { ranTypeHint: "USE", bodyPhrase: "Your Authorization Request for Use has been submitted successfully" }),
  tpl(123, "Authorization Terms Declined for Transfer Authorization", "Invoice Issued to Applicant - Awaiting Proof of Payment (POP)", true, "Payment", { outstandingPayment: true, bodyPhrase: "The Invoice for Payment of Authorization has been submitted to the Licensee successfully" }),
  tpl(124, "Transfer Authorization - Declination of Authorization Terms", "Terms Declined by Licensee (Transfer) - Authority to review", false, "Authorization / Conditions", { special: "reset" }),
  tpl(125, "Authorization Terms for Transfer Authorization Application", "CEO approval pending", true, "Approval (CEO/Board)", { ranTypeHint: "TRF", bodyPhrase: "the Regulatory Authority has issued Authorization Terms for your application. Kindly login to the system and accept the Terms and Conditions" }),
  tpl(126, "Transfer Authorization - Revisit Authorization Terms", "Authorization Terms Returned for Revisit (Transfer)", false, "Authorization / Conditions", { special: "reset" }),
  tpl(127, "Transfer Authorization Application Approved", "Transfer Approved - Certificate available", true, "Licence Issued", { ranTypeHint: "TRF", bodyPhrase: "Your Application for Transfer Authorization has been Approved" }),
  tpl(128, "Transfer Authorization Application Rejected", "Transfer Application Rejected", false, "Other", { special: "reset" }),
  tpl(129, "Transfer Authorization Expiry", "Transfer Expiring - Renewal Reminder", false, "Application", { responsibleParty: "Licensee" }),
  tpl(137, "Use Authorization - Declination of Authorization Terms", "Terms Declined by Licensee (Use) - Authority to review", false, "Authorization / Conditions", { special: "reset" }),
  tpl(138, "Authorization Terms for Licence Application", "CEO approval pending", true, "Approval (CEO/Board)", { bodyPhrase: "the Regulatory Authority has issued Authorization Terms for your application" }),
  tpl(139, "Use Authorization - Revisit Authorization Terms", "Authorization Terms Returned for Revisit (Use)", false, "Authorization / Conditions", { special: "reset" }),
  tpl(140, "Ionising Radiation Licence Application Approved", "Licence Approved (Use) - Licence available", true, "Licence Issued", { ranTypeHint: "USE", special: "form-i-prompt", bodyPhrase: "Your Application for an Ionising Radiation Licence has been Approved" }),
  tpl(141, "Use Authorization Application Rejected", "Application Rejected (Use)", false, "Other", { special: "reset" }),
  tpl(142, "Use Authorization Expiry", "Licence Expiring - Renewal Reminder (Use)", false, "Application", { responsibleParty: "Licensee" }),
  tpl(146, "Workflow Amendment", "Workflow Amended - New instance created", false, "Application", { responsibleParty: "NRSO", priority: "NORMAL" }),
  tpl(147, "Workflow Assignment", "Data Form Assigned - Pending action by assigned party (stage = data-form name)", false, "Review & Assessment", { generic: true, priority: "NORMAL" }),
  tpl(148, "Workflow Renewal", "Workflow Renewed - New instance created", false, "Application", { responsibleParty: "NRSO", priority: "NORMAL" }),
  tpl(149, "##WorkflowInstanceName## Withdrawal", "Workflow Withdrawn", true, "Other", { special: "reset", responsibleParty: "Applicant", bodyPhrase: "has been withdrawn" }),
];

// ---------------------------------------------------------------------------
// Derived lookup structures
// ---------------------------------------------------------------------------

/** Exact normalized-subject → template (primary match). Duplicates collapse. */
export const BY_SUBJECT_NORM: Map<string, RaisTemplate> = (() => {
  const m = new Map<string, RaisTemplate>();
  for (const t of RAIS_TEMPLATES) if (!m.has(t.subjectNorm)) m.set(t.subjectNorm, t);
  return m;
})();

/** Templates carrying a distinctive body phrase, for the fallback scan. */
export const TEMPLATES_BY_BODY_PHRASE: RaisTemplate[] = RAIS_TEMPLATES.filter(
  (t) => !!t.bodyPhraseNorm,
);
