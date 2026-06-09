import { classifyMatch, matchOne } from "./matching";
import {
  BY_SUBJECT_NORM,
  RAIS_TEMPLATES,
  STATUS_TO_STAGE,
  TEMPLATES_BY_BODY_PHRASE,
  normalizeSubject,
  ranHint,
  type NewApplicationStatus,
  type RaisTemplate,
} from "./raisTemplates";
import {
  type Facility,
  type LicenceWorkflow,
  type Stage,
  type WorkflowPhase,
  type WorkflowPriority,
} from "./types";

/**
 * RAIS dashboard parser.
 *
 * The Licensing Status tab lets an officer paste the raw RAIS "assigned data
 * forms" feed (the same dump they used to drop into an AI project) and turns it
 * into one tracked record per licensing application — its current pipeline
 * stage, who must act next, and any payment / bottleneck dependencies. It is a
 * pure, rule-based parser (no AI/API) so it works offline and deterministically;
 * the page wraps it with an editable review step before anything is saved.
 *
 * Shape of the feed (learned from a real dump): notifications are stacked and
 * separated by a "+ Show More" line. Each block's first non-empty line is the
 * notification title; the rest is body text that embeds the workflow RAN and the
 * facility name in a handful of recurring phrasings.
 */

// ---------------------------------------------------------------------------
// Notification classification
// ---------------------------------------------------------------------------

interface Mapping {
  phase: WorkflowPhase;
  /** Short sub-stage label shown on the card. */
  stage: string;
  responsibleParty: string;
  priority: WorkflowPriority;
  outstandingPayment?: boolean;
  /** Accounts clearance cancels a lingering "Payment Pending" for the facility. */
  clearsPayment?: boolean;
  bottleneck?: boolean;
  unrecognized?: boolean;
  /**
   * Canonical RAIS status from the email-template table (raisTemplates.ts) when
   * the email subject matched a template. Drives the facility's displayed
   * `currentStatus` and (via STATUS_TO_STAGE) its rolled-up `facilityStage`.
   */
  currentStatus?: NewApplicationStatus;
  /** The two licence-issuing cases + resets (see LicenceWorkflow.special). */
  special?: "renewal-auto" | "form-i-prompt" | "reset";
}

/**
 * Ordered matchers (most specific first) mapping a notification title to its
 * pipeline meaning. Encodes the officer's RAIS triage prompt directly.
 */
const RULES: Array<{ test: RegExp; map: Mapping }> = [
  // --- Payment workflow -----------------------------------------------------
  {
    // RAIS "Invoice Request Generator": the applicant must first generate an
    // invoice request — the invoice itself does not exist yet.
    test: /invoice request generator|invoice request is required|invoice generation|generate (your )?invoice/i,
    map: { phase: "Payment", stage: "Invoice Generation Pending", responsibleParty: "Applicant", priority: "APPLICANT" },
  },
  {
    test: /payment pending/i,
    map: { phase: "Payment", stage: "Awaiting Proof of Payment", responsibleParty: "Applicant", priority: "APPLICANT", outstandingPayment: true },
  },
  {
    test: /submission of invoice for payment/i,
    map: { phase: "Payment", stage: "Awaiting Proof of Payment", responsibleParty: "Applicant", priority: "APPLICANT", outstandingPayment: true },
  },
  {
    test: /confirm payment/i,
    map: { phase: "Payment", stage: "Awaiting Proof of Payment", responsibleParty: "Applicant", priority: "APPLICANT", outstandingPayment: true },
  },
  {
    test: /attach invoice/i,
    map: { phase: "Payment", stage: "Attach Invoice", responsibleParty: "Accounts Officer", priority: "HIGH" },
  },
  {
    test: /issuance of invoice and payment/i,
    map: { phase: "Payment", stage: "Invoice Request", responsibleParty: "Applicant", priority: "APPLICANT" },
  },
  // --- Accounts clearance ---------------------------------------------------
  {
    test: /accounts clearance/i,
    map: { phase: "Accounts Clearance", stage: "Accounts Clearance", responsibleParty: "Accounts Officer", priority: "HIGH", clearsPayment: true },
  },
  // --- RPA receipt ----------------------------------------------------------
  {
    test: /rpa official use/i,
    map: { phase: "RPA Receipt", stage: "Application Receipt (RPA)", responsibleParty: "NRSO", priority: "NORMAL" },
  },
  {
    test: /for official use only/i,
    map: { phase: "RPA Receipt", stage: "RPA Internal Form", responsibleParty: "NRSO", priority: "NORMAL" },
  },
  // --- Review & assessment (order: report → approval → recommendation → review)
  {
    test: /review and assessment report/i,
    map: { phase: "Review & Assessment", stage: "Evaluation Report", responsibleParty: "MNRS", priority: "CRITICAL", bottleneck: true },
  },
  {
    test: /review and assessment approval/i,
    map: { phase: "Review & Assessment", stage: "R&A Approval", responsibleParty: "MNRS", priority: "NORMAL" },
  },
  {
    test: /recommendation/i,
    map: { phase: "Review & Assessment", stage: "R&A Recommendation", responsibleParty: "SNRSO", priority: "NORMAL" },
  },
  {
    test: /improvement actions/i,
    map: { phase: "Review & Assessment", stage: "Improvement Actions Required", responsibleParty: "NRSO / Applicant", priority: "HIGH" },
  },
  {
    // RAIS "Additional Information Required" / "Request for Further Particulars
    // or Information": more info needed to continue the review & assessment.
    test: /additional information|further information required|further particulars|request(ed)? for (additional|further) (information|particulars)/i,
    map: { phase: "Review & Assessment", stage: "Further Information Required", responsibleParty: "NRSO / Applicant", priority: "HIGH" },
  },
  {
    test: /review remarks/i,
    map: { phase: "Review & Assessment", stage: "Review Remarks", responsibleParty: "NRSO / Applicant", priority: "HIGH" },
  },
  {
    test: /external review|internal review|review and evaluation|review and assessment/i,
    map: { phase: "Review & Assessment", stage: "Review & Assessment", responsibleParty: "NRSO", priority: "HIGH" },
  },
  // --- Authorization terms / conditions ------------------------------------
  {
    test: /authorization terms|terms and conditions of licence|conditions for renewal|requested terms/i,
    map: { phase: "Authorization / Conditions", stage: "Authorization Terms / Conditions", responsibleParty: "NRSO", priority: "NORMAL" },
  },
  // --- Approvals ------------------------------------------------------------
  {
    test: /licence approval ceo|ceo licence approval/i,
    map: { phase: "Approval (CEO/Board)", stage: "CEO Approval", responsibleParty: "CEO", priority: "CRITICAL" },
  },
  {
    test: /board licence approval|rpa board|board approval/i,
    map: { phase: "Approval (CEO/Board)", stage: "Board Approval", responsibleParty: "Board", priority: "CRITICAL" },
  },
  {
    test: /director nuclear and radiation safety approval|director nuclear/i,
    map: { phase: "Approval (CEO/Board)", stage: "Director NRS Approval", responsibleParty: "Director NRS", priority: "CRITICAL" },
  },
  // --- Licence / certificate issued ----------------------------------------
  {
    test: /application approved|renewal application approved|licence certificate|authorization certificate|ionising radiation licence certificate/i,
    map: { phase: "Licence Issued", stage: "Licence / Certificate Issued", responsibleParty: "NRSO", priority: "NORMAL" },
  },
  // --- Inspection track -----------------------------------------------------
  {
    test: /inspection approved/i,
    map: { phase: "Inspection", stage: "Inspection Approved", responsibleParty: "Senior Inspection Officer", priority: "NORMAL" },
  },
  {
    test: /inspection rejected/i,
    map: { phase: "Inspection", stage: "Inspection Rejected", responsibleParty: "Inspection Team", priority: "HIGH" },
  },
  {
    test: /inspection review/i,
    map: { phase: "Inspection", stage: "Inspection Review", responsibleParty: "Senior Inspection Officer", priority: "HIGH" },
  },
  {
    test: /inspection scope|inspection report|medical inspection|non medical inspection|inspection/i,
    map: { phase: "Inspection", stage: "Inspection", responsibleParty: "Inspection Team", priority: "NORMAL" },
  },
  // --- Applicant-side intake ------------------------------------------------
  {
    // Applicant filling a transfer/decommission/other licence form (RAIS internal
    // "… Form VI data form assigned" notifications).
    test: /application for transfer of licence|transfer of licence form|application for (variation|decommission)/i,
    map: { phase: "Application", stage: "Application Submission", responsibleParty: "Applicant", priority: "APPLICANT" },
  },
  {
    // RAIS email: "… Licence Request Submitted successfully" — applicant has
    // filed; the application now sits with the Authority.
    test: /submitted successfully|request submitted|submission successful/i,
    map: { phase: "Application", stage: "Application Submitted", responsibleParty: "NRSO", priority: "NORMAL" },
  },
  {
    test: /licence expiry|about to expire|granted to facility/i,
    map: { phase: "Application", stage: "Expiry / Renewal Reminder", responsibleParty: "Applicant", priority: "APPLICANT" },
  },
  {
    test: /application submission form|new form i|new ionising radiation licence renewal request|new variation of terms|regulatory requirements|new licence|new ionising radiation licence request|notice of intention to decomiss/i,
    map: { phase: "Application", stage: "Application Submission", responsibleParty: "Applicant", priority: "APPLICANT" },
  },
];

const UNRECOGNIZED: Mapping = {
  phase: "Other",
  stage: "Unrecognized",
  responsibleParty: "—",
  priority: "NORMAL",
  unrecognized: true,
};

export function classifyNotification(title: string): Mapping {
  const t = (title || "").trim();
  if (!t) return UNRECOGNIZED;
  for (const rule of RULES) {
    if (rule.test.test(t)) return rule.map;
  }
  return UNRECOGNIZED;
}

// The two "…Licence Application Approved" templates (collision pair) and the
// withdrawal template, resolved once for the disambiguation/suffix checks.
const APPROVED_RENEWAL = RAIS_TEMPLATES.find((t) => t.special === "renewal-auto");
const APPROVED_FORM_I = RAIS_TEMPLATES.find((t) => t.special === "form-i-prompt");
const WITHDRAWAL_TEMPLATE = RAIS_TEMPLATES.find((t) => t.sr === 149);

/** Build a classification Mapping from a matched email template. */
function mappingFromTemplate(t: RaisTemplate): Mapping {
  return {
    phase: t.phase,
    // The canonical status doubles as the card's sub-stage label — informative
    // and consistent with the displayed currentStatus.
    stage: t.status,
    responsibleParty: t.responsibleParty,
    priority: t.priority,
    outstandingPayment: t.outstandingPayment,
    clearsPayment: t.clearsPayment,
    bottleneck: t.bottleneck,
    currentStatus: t.status,
    special: t.special,
  };
}

/**
 * Resolve the two "…Licence Application Approved" templates, which differ only by
 * the word "Renewal" in the subject and "a renewal" vs "an" in the body. Once a
 * subject matches one of them, the workflow RAN type is the second check the spec
 * requires: USE.REN ⇒ the renewal row, plain USE ⇒ the Form-I (new) row. If the
 * RAN is silent/ambiguous, keep the subject's own row.
 */
function disambiguate(
  t: RaisTemplate,
  hint: ReturnType<typeof ranHint>,
): RaisTemplate {
  if (t.special !== "renewal-auto" && t.special !== "form-i-prompt") return t;
  if (hint === "USE.REN") return APPROVED_RENEWAL ?? t;
  if (hint === "USE") return APPROVED_FORM_I ?? t;
  return t;
}

/**
 * Classify a RAIS email using the authoritative template table (raisTemplates),
 * keyed on the SUBJECT, with the legacy regex RULES as a backward-compatible
 * fallback for dashboard-paste vocabularies. Deterministic, no LLM.
 *
 *  1. exact normalized-subject hit (the dependable key) — the master "Workflow
 *     Assignment" template carries its real stage in the body's data-form name,
 *     so those defer to the legacy RULES on the body;
 *  2. withdrawal subjects (templated "##WorkflowInstanceName## Withdrawal");
 *  3. distinctive body-phrase fallback when the subject is missing/unmatched;
 *  4. legacy RULES on the subject (then body) — keeps every previously-handled
 *     phrasing working exactly as before (this is the backward-compat seam);
 *  5. UNRECOGNIZED.
 */
export function classifyEmail(input: {
  subject: string;
  body: string;
  primaryRan?: string;
}): Mapping {
  const subjectNorm = normalizeSubject(input.subject);
  const hint = ranHint(input.primaryRan || "");

  // 1. Primary: exact subject match.
  const exact = subjectNorm ? BY_SUBJECT_NORM.get(subjectNorm) : undefined;
  if (exact) {
    if (exact.generic) {
      const legacy = classifyNotification(input.body);
      if (!legacy.unrecognized) return { ...legacy, currentStatus: exact.status };
      return mappingFromTemplate(exact);
    }
    return mappingFromTemplate(disambiguate(exact, hint));
  }

  // 2. Withdrawal: subject is "<instance> Withdrawal" (leading placeholder).
  if (WITHDRAWAL_TEMPLATE && /\bwithdrawal$/.test(subjectNorm)) {
    return mappingFromTemplate(WITHDRAWAL_TEMPLATE);
  }

  // 3. Fallback: distinctive body phrase.
  const bodyNorm = normalizeSubject(input.body);
  if (bodyNorm) {
    for (const t of TEMPLATES_BY_BODY_PHRASE) {
      if (t.bodyPhraseNorm && bodyNorm.includes(t.bodyPhraseNorm)) {
        return mappingFromTemplate(disambiguate(t, hint));
      }
    }
  }

  // 4. Legacy regex rules (subject, then body) for dashboard-paste vocabularies.
  const legacy = classifyNotification(input.subject);
  if (!legacy.unrecognized) return legacy;
  const legacyBody = classifyNotification(input.body);
  if (!legacyBody.unrecognized) return legacyBody;

  // 5. Nothing matched.
  return UNRECOGNIZED;
}

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------

/** Matches every RAIS reference format (slash or hyphen separated). */
const RAN_RE =
  /(AUTH[\/-][A-Z.]+[\/-]\d+|RPA\/LIC\/\d+|INSP\/AUTH\/\d+|INSP\/\d+|RA\/\d+)/gi;

const PAY_RE = /AUTH[\/-]PAY[\/-]\d+/i;
const FAC_RE = /FAC\/[A-Za-z0-9]+/i;

export function ranTypeLabel(ran: string): string {
  const s = (ran || "").toUpperCase();
  if (/USE\.REN/.test(s)) return "Use Authorization Renewal";
  if (/USE\.NEW|\bUSE\b/.test(s)) return "New Use Authorization";
  if (/PAY/.test(s)) return "Payment";
  if (/VAR/.test(s)) return "Variation of Terms";
  if (/TRF|TRANSF/.test(s)) return "Transfer";
  if (/TRP|TRANSP/.test(s)) return "Transport";
  if (/IMP/.test(s)) return "Import";
  if (/DEC/.test(s)) return "Decommission";
  if (/RPA\/LIC/.test(s)) return "New Licence / Import";
  if (/^RA\//.test(s)) return "Review & Assessment";
  if (/INSP/.test(s)) return "Inspection";
  return "Other";
}

/** All RANs in a block, in first-seen order, de-duplicated. */
function allRans(block: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  RAN_RE.lastIndex = 0;
  while ((m = RAN_RE.exec(block))) {
    const r = m[1].toUpperCase();
    if (!seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  }
  return out;
}

/**
 * The application RAN this block is "about" — the first RAN that is not a
 * payment (AUTH/PAY) sub-workflow, falling back to the first RAN of any kind so
 * a standalone Confirm-Payment block still keys on its AUTH/PAY number.
 */
function primaryRan(rans: string[]): string {
  const nonPay = rans.find((r) => !PAY_RE.test(r));
  return nonPay || rans[0] || "";
}

function paymentRan(block: string): string {
  const m = block.match(PAY_RE);
  return m ? m[0].toUpperCase() : "";
}

/** Collapse doubled single-quotes RAIS sometimes emits ("ST. LUKE''S"). */
function cleanName(s: string): string {
  return s.replace(/''/g, "'").replace(/\s+/g, " ").trim();
}

/**
 * Pull the facility name (and FAC code when present) out of a block, trying the
 * recurring RAIS phrasings in order of reliability.
 */
export function extractFacility(block: string): { name: string; facCode: string } {
  let m: RegExpMatchArray | null;

  // "Facillity Name and RAN: <NAME> - FAC/####" (note RAIS's misspelling)
  if ((m = block.match(/Facillity Name and RAN:\s*([^\n]+?)\s*-\s*(FAC\/[A-Za-z0-9]+)/i))) {
    return { name: cleanName(m[1]), facCode: m[2].toUpperCase() };
  }
  // "Facility Name - <NAME>"
  if ((m = block.match(/Facility Name\s*[-:]\s*([^\n]+)/i))) {
    return { name: cleanName(m[1]), facCode: "" };
  }
  // "... data form of <RAN> <NAME> process has been assigned"
  if ((m = block.match(/data form of\s+\S+\s+([^\n]+?)\s+process has been assigned/i))) {
    return { name: cleanName(m[1]), facCode: "" };
  }
  // "received from <person> working in <NAME> Facility on <date>"
  if ((m = block.match(/working in\s+([^\n]+?)\s+Facility on\b/i))) {
    return { name: cleanName(m[1]), facCode: "" };
  }
  // "granted to Facility - <NAME> is about to expire"
  if ((m = block.match(/granted to Facility\s*-\s*([^\n]+?)\s+is about to expire/i))) {
    return { name: cleanName(m[1]), facCode: "" };
  }
  // Inspection approved / rejected
  if ((m = block.match(/carried out at your facility\s*-\s*([^\n]+?)\s+has been/i))) {
    return { name: cleanName(m[1]), facCode: "" };
  }
  if ((m = block.match(/carried out on\s+([^\n]+?)\s+facility has been/i))) {
    return { name: cleanName(m[1]), facCode: "" };
  }

  // A forwarded plain-text body often hard-wraps long lines (~78 chars), which
  // can split the facility name across two lines and defeat the line-anchored
  // patterns above (e.g. "… MINEXEC (PTY)\nLIMITED process has been assigned …").
  // Retry the inline patterns on a whitespace-collapsed copy; each keeps a strong
  // trailing anchor, so the now newline-spanning capture stays bounded.
  const flat = block.replace(/\s+/g, " ");
  if ((m = flat.match(/data form of\s+\S+\s+(.+?)\s+process has been assigned/i))) {
    return { name: cleanName(m[1]), facCode: "" };
  }
  if ((m = flat.match(/working in\s+(.+?)\s+Facility on\b/i))) {
    return { name: cleanName(m[1]), facCode: "" };
  }
  if ((m = flat.match(/granted to Facility\s*-\s*(.+?)\s+is about to expire/i))) {
    return { name: cleanName(m[1]), facCode: "" };
  }

  // FAC code on its own as a last resort.
  const fac = block.match(FAC_RE);
  return { name: "", facCode: fac ? fac[0].toUpperCase() : "" };
}

function extractDate(block: string): string {
  const m =
    block.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/) ||
    block.match(/\b(\d{1,2}-[A-Za-z]{3}-\d{4})\b/);
  return m ? m[1] : "";
}

// ---------------------------------------------------------------------------
// Pipeline ordering
// ---------------------------------------------------------------------------

export const PHASE_RANK: Record<WorkflowPhase, number> = {
  Application: 1,
  Payment: 2,
  "Accounts Clearance": 3,
  "RPA Receipt": 4,
  "Review & Assessment": 5,
  "Authorization / Conditions": 6,
  "Approval (CEO/Board)": 7,
  "Licence Issued": 8,
  Inspection: 4,
  Other: 0,
};

const PRIORITY_RANK: Record<WorkflowPriority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  NORMAL: 2,
  APPLICANT: 1,
};

/** The Stage value rolled onto a matched facility for each pipeline phase. */
function facilityStageFor(phase: WorkflowPhase, stage: string): Stage {
  switch (phase) {
    case "Application":
      return "Application Submitted";
    case "Payment":
      return stage === "Invoice Generation Pending"
        ? "Invoice Generation Pending"
        : "Waiting for Payment";
    case "Accounts Clearance":
      return "Accounts Clearance Pending";
    case "RPA Receipt":
      return "Waiting for Review and Assessment";
    case "Review & Assessment":
      return stage === "Further Information Required"
        ? "Under Internal Review (Further Information Required)"
        : "Under Review and Assessment";
    case "Authorization / Conditions":
      return "Authorization Terms Issued";
    case "Approval (CEO/Board)":
      return stage === "Board Approval"
        ? "Board Licence Approval Required"
        : "CEO Licence Approval Required";
    case "Licence Issued":
      return "Licence / Certificate Issued";
    case "Inspection":
      return "Inspection in Progress";
    default:
      return "No Application Submitted";
  }
}

/**
 * The Stage to roll onto a facility for a classified notification. When the email
 * matched a template, the canonical status's mapped Stage is authoritative;
 * otherwise fall back to the phase-based mapping (the legacy dashboard-paste path).
 */
function facilityStageForMap(map: Mapping): Stage {
  return map.currentStatus
    ? STATUS_TO_STAGE[map.currentStatus]
    : facilityStageFor(map.phase, map.stage);
}

// ---------------------------------------------------------------------------
// Block splitting + aggregation
// ---------------------------------------------------------------------------

/** Split the pasted feed into one block of text per notification. */
export function splitBlocks(text: string): string[] {
  const raw = (text || "").replace(/\r\n/g, "\n");
  const parts = raw.includes("+ Show More")
    ? raw.split(/\n?\s*\+\s*Show More\s*\n?/i)
    : raw.split(/\n{2,}/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function firstLine(block: string): string {
  for (const line of block.split("\n")) {
    const t = line.trim();
    if (t) return t;
  }
  return "";
}

/**
 * Parse the pasted RAIS feed into one workflow record per application RAN. Pure:
 * facility linking against the register happens separately in linkFacilities().
 */
export function parseNotifications(text: string): LicenceWorkflow[] {
  const blocks = splitBlocks(text);
  const byRan = new Map<string, LicenceWorkflow>();
  const unrecognized: LicenceWorkflow[] = [];

  blocks.forEach((block, i) => {
    const title = firstLine(block);
    const rans = allRans(block);
    const ran = primaryRan(rans);
    // Subject (title) is the primary key; the RAN type disambiguates the two
    // near-identical "…Application Approved" templates.
    const map = classifyEmail({ subject: title, body: block, primaryRan: ran });
    const { name, facCode } = extractFacility(block);
    const payRan = paymentRan(block);
    const date = extractDate(block);

    // Blocks with no RAN and no facility (blank "data form of process…", or
    // pure footer text) are noise — bucket them so nothing silently vanishes.
    if (!ran && !name) {
      unrecognized.push(
        makeRecord(`wf-unrecognized-${i}`, "", title, name, facCode, payRan, date, UNRECOGNIZED),
      );
      return;
    }

    const key = ran || `name:${name.toLowerCase()}`;
    const existing = byRan.get(key);
    if (!existing) {
      byRan.set(
        key,
        makeRecord(`wf-${key}`, ran, title, name, facCode, payRan, date, map),
      );
      return;
    }
    mergeInto(existing, title, name, facCode, payRan, date, map);
  });

  // Fold standalone "Confirm Payment" blocks (keyed by their AUTH/PAY RAN) into
  // the application record that references that same payment workflow.
  const records = [...byRan.values()];
  const payToApp = new Map<string, LicenceWorkflow>();
  for (const r of records) if (r.paymentRan) payToApp.set(r.paymentRan, r);
  for (const r of records) {
    const app = payToApp.get(r.ran);
    if (app && app !== r && PAY_RE.test(r.ran)) {
      mergeInto(
        app,
        r.notificationTitle,
        r.facilityName || "",
        r.facCode || "",
        r.ran,
        r.lastSeen,
        {
          phase: r.phase,
          stage: r.stage,
          responsibleParty: r.responsibleParty,
          priority: r.priority,
          outstandingPayment: r.outstandingPayment,
          currentStatus: r.currentStatus,
          special: r.special,
        },
      );
      byRan.delete(r.ran);
      byRan.delete(`name:${(r.facilityName || "").toLowerCase()}`);
    }
  }

  const all = [...byRan.values(), ...unrecognized];
  applyFacilityDependencies(all);
  return all;
}

function makeRecord(
  id: string,
  ran: string,
  title: string,
  name: string,
  facCode: string,
  payRan: string,
  date: string,
  map: Mapping,
): LicenceWorkflow {
  return {
    id,
    ran,
    ranType: ranTypeLabel(ran),
    facilityId: null,
    facilityName: name,
    facCode,
    notificationTitle: title,
    stage: map.stage,
    phase: map.phase,
    responsibleParty: map.responsibleParty,
    priority: map.priority,
    outstandingPayment: !!map.outstandingPayment,
    bottleneck: !!map.bottleneck,
    paymentRan: payRan || undefined,
    alerts: [],
    notifications: title ? [title] : [],
    facilityStage: facilityStageForMap(map),
    currentStatus: map.currentStatus,
    special: map.special,
    lastSeen: date,
  };
}

/**
 * Merge a notification into an existing record, keeping the furthest-reached
 * pipeline stage as the record's headline (ties broken by urgency).
 */
function mergeInto(
  rec: LicenceWorkflow,
  title: string,
  name: string,
  facCode: string,
  payRan: string,
  date: string,
  map: Mapping,
): void {
  if (title && !rec.notifications.includes(title)) rec.notifications.push(title);
  if (!rec.facilityName && name) rec.facilityName = name;
  if (!rec.facCode && facCode) rec.facCode = facCode;
  if (!rec.paymentRan && payRan) rec.paymentRan = payRan;
  if (date && (!rec.lastSeen || date > rec.lastSeen)) rec.lastSeen = date;
  if (map.outstandingPayment) rec.outstandingPayment = true;
  if (map.bottleneck) rec.bottleneck = true;

  const curRank = PHASE_RANK[rec.phase];
  const newRank = PHASE_RANK[map.phase];
  const advances =
    newRank > curRank ||
    (newRank === curRank &&
      PRIORITY_RANK[map.priority] > PRIORITY_RANK[rec.priority]);
  if (advances) {
    rec.stage = map.stage;
    rec.phase = map.phase;
    rec.responsibleParty = map.responsibleParty;
    rec.priority = map.priority;
    rec.notificationTitle = title || rec.notificationTitle;
    rec.facilityStage = facilityStageForMap(map);
    rec.currentStatus = map.currentStatus;
    rec.special = map.special;
  }
}

/**
 * Facility-level cross-references from the officer's prompt:
 *  - An Accounts Clearance anywhere for a facility cancels lingering "Payment
 *    Pending" flags on that facility's other applications.
 *  - A Review & Assessment must not proceed while the facility still owes a
 *    payment — flag it CRITICAL and tell the NRSO to wait.
 */
function applyFacilityDependencies(records: LicenceWorkflow[]): void {
  const groups = new Map<string, LicenceWorkflow[]>();
  for (const r of records) {
    const key = (r.facilityName || r.ran).toLowerCase();
    const g = groups.get(key) || [];
    g.push(r);
    groups.set(key, g);
  }

  for (const group of groups.values()) {
    const hasClearance = group.some((r) => r.phase === "Accounts Clearance");
    const hasOutstanding = group.some((r) => r.outstandingPayment);

    if (hasClearance) {
      for (const r of group) r.outstandingPayment = false;
    }
    const blocking = hasOutstanding && !hasClearance;
    if (!blocking) continue;

    for (const r of group) {
      if (r.phase === "Review & Assessment") {
        r.priority = "CRITICAL";
        const alert = `NRSO should wait for payment clearance before reviewing ${r.facilityName || r.ran}`;
        if (!r.alerts.includes(alert)) r.alerts.push(alert);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Facility register linking (reuses the bulk-approval matcher)
// ---------------------------------------------------------------------------

/**
 * Resolve each record's facility against the register, filling facilityId /
 * facCode / matchScore. Reuses matchOne() so behaviour matches Bulk Approval.
 */
export function linkFacilities(
  records: LicenceWorkflow[],
  facilities: Facility[],
): LicenceWorkflow[] {
  return records.map((r) => {
    if (!r.facilityName && !r.facCode) return r;
    // Prefer an exact FAC-code hit, else fuzzy-match on the name.
    const byCode = r.facCode
      ? facilities.find((f) => f.facCode.toUpperCase() === r.facCode.toUpperCase())
      : undefined;
    if (byCode) {
      return { ...r, facilityId: byCode.id, matchScore: 1 };
    }
    const m = matchOne({ name: r.facilityName, number: r.facCode }, facilities);
    if (m.best && m.classification !== "none") {
      return {
        ...r,
        facilityId: m.best.id,
        facCode: r.facCode || m.best.facCode,
        matchScore: m.score,
      };
    }
    return { ...r, matchScore: m.score };
  });
}

/**
 * Decide whether a linked record is safe to apply to the register automatically
 * or should wait in the review queue. Used by the email connector
 * (ingestRaisEmail): only a confident facility match — the same "auto" tier the
 * Bulk Approval matcher uses (score ≥ 0.72) — is auto-applied. Everything else
 * (weak/no match, or a notification we could not classify) is queued so an
 * officer confirms the facility before the register moves.
 */
export function ingestDecision(r: LicenceWorkflow): "auto" | "review" {
  if (!r.facilityId) return "review";
  if (r.stage === "Unrecognized") return "review";
  return classifyMatch(r.matchScore ?? 0) === "auto" ? "auto" : "review";
}

// ---------------------------------------------------------------------------
// RAN-based linking ("remember the facility for an application")
// ---------------------------------------------------------------------------

/** A facility a RAN is known to belong to. */
export interface RanFacility {
  id: string;
  name: string;
  facCode: string;
}

/**
 * Build a RAN → facility map from the register's recorded authorisation numbers.
 * Each facility carries its licence/application RAN(s) in `auths[].number`
 * (e.g. AUTH/USE.REN/0692), so an email that cites only a RAN can still be tied
 * to its facility.
 */
export function ranMapFromFacilities(
  facilities: Facility[],
): Map<string, RanFacility> {
  const m = new Map<string, RanFacility>();
  for (const f of facilities) {
    for (const a of f.auths || []) {
      if (a.number) {
        m.set(a.number.toUpperCase(), {
          id: f.id,
          name: f.name,
          facCode: f.facCode,
        });
      }
    }
  }
  return m;
}

/**
 * Extend a RAN → facility map with previously-matched workflow records. This is
 * the "memory": once any email for an application RAN (or its payment RAN) has
 * been tied to a facility, every later notification for it links itself.
 */
export function addWorkflowsToRanMap(
  map: Map<string, RanFacility>,
  workflows: LicenceWorkflow[],
): Map<string, RanFacility> {
  for (const w of workflows) {
    if (!w.facilityId) continue;
    const fac: RanFacility = {
      id: w.facilityId,
      name: w.facilityName,
      facCode: w.facCode,
    };
    if (w.ran) map.set(w.ran.toUpperCase(), fac);
    if (w.paymentRan) map.set(w.paymentRan.toUpperCase(), fac);
  }
  return map;
}

/**
 * Second-pass linking for records that name no facility (payment, board-approval
 * and internal "data form assigned" emails carry only a RAN). Fills the facility
 * from the RAN → facility map. Run AFTER linkFacilities so a real name match
 * always wins; this only rescues the ones it left unmatched.
 */
export function linkByRan(
  records: LicenceWorkflow[],
  ranToFacility: Map<string, RanFacility>,
): LicenceWorkflow[] {
  if (!ranToFacility.size) return records;
  return records.map((r) => {
    if (r.facilityId) return r;
    const keys = [r.ran, r.paymentRan].filter(Boolean) as string[];
    for (const k of keys) {
      const hit = ranToFacility.get(k.toUpperCase());
      if (hit) {
        return {
          ...r,
          facilityId: hit.id,
          facilityName: r.facilityName || hit.name,
          facCode: r.facCode || hit.facCode,
          matchScore: 1, // RAN identity is an exact link
        };
      }
    }
    return r;
  });
}

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

export interface WorkflowReport {
  total: number;
  unrecognized: number;
  byPriority: Record<WorkflowPriority, LicenceWorkflow[]>;
  byPhase: Array<{ phase: WorkflowPhase; count: number }>;
  roleTasks: Array<{ role: string; tasks: string[] }>;
  alerts: string[];
}

function actionFor(r: LicenceWorkflow): string {
  const fac = r.facilityName || "(unmatched facility)";
  const ran = r.ran || "(no RAN)";
  switch (r.phase) {
    case "Approval (CEO/Board)":
      if (r.stage === "Board Approval") return `Board must approve licence for ${fac} (${ran})`;
      if (r.stage === "Director NRS Approval") return `Director NRS must approve ${fac} (${ran})`;
      return `CEO must approve licence for ${fac} (${ran})`;
    case "Payment":
      if (r.stage === "Attach Invoice") return `Accounts Officer must attach invoice for ${ran} (${fac})`;
      if (r.stage === "Invoice Request") return `Applicant must request invoice for ${fac} (${ran})`;
      return `Applicant must upload Proof of Payment for ${fac} (${ran})`;
    case "Accounts Clearance":
      return `Accounts Officer must clear ${fac} for review (${ran})`;
    case "RPA Receipt":
      return `NRSO to receive & forward application for ${fac} (${ran})`;
    case "Review & Assessment":
      if (r.alerts.length) return r.alerts[0];
      if (r.bottleneck) return `MNRS must submit evaluation report for ${ran} — workflow bottleneck (${fac})`;
      if (r.stage === "R&A Recommendation") return `SNRSO to prepare recommendation for ${fac} (${ran})`;
      if (r.stage === "R&A Approval") return `MNRS to approve review & assessment for ${fac} (${ran})`;
      return `NRSO to review & assess ${fac} (${ran})`;
    case "Authorization / Conditions":
      return `NRSO to attach licence conditions for ${fac} (${ran})`;
    case "Licence Issued":
      return `NRSO to issue licence certificate for ${fac} (${ran})`;
    case "Inspection":
      return `Inspection team to action ${ran} (${fac})`;
    case "Application":
      return `Applicant to complete application for ${fac} (${ran})`;
    default:
      return `Review notification for ${fac} (${ran})`;
  }
}

export function buildReport(records: LicenceWorkflow[]): WorkflowReport {
  const byPriority: Record<WorkflowPriority, LicenceWorkflow[]> = {
    CRITICAL: [],
    HIGH: [],
    NORMAL: [],
    APPLICANT: [],
  };
  const phaseCounts = new Map<WorkflowPhase, number>();
  const roleMap = new Map<string, string[]>();
  const alerts: string[] = [];
  let unrecognized = 0;

  for (const r of records) {
    if (r.stage === "Unrecognized") {
      unrecognized++;
      continue;
    }
    byPriority[r.priority].push(r);
    phaseCounts.set(r.phase, (phaseCounts.get(r.phase) || 0) + 1);

    const role = r.responsibleParty;
    const tasks = roleMap.get(role) || [];
    tasks.push(actionFor(r));
    roleMap.set(role, tasks);

    for (const a of r.alerts) if (!alerts.includes(a)) alerts.push(a);
    if (r.bottleneck) {
      const a = `MNRS evaluation report outstanding for ${r.facilityName || r.ran} (${r.ran}) — bottleneck`;
      if (!alerts.includes(a)) alerts.push(a);
    }
  }

  const order: WorkflowPriority[] = ["CRITICAL", "HIGH", "NORMAL", "APPLICANT"];
  for (const p of order) {
    byPriority[p].sort((a, b) => {
      const d = PHASE_RANK[b.phase] - PHASE_RANK[a.phase];
      return d !== 0 ? d : a.facilityName.localeCompare(b.facilityName);
    });
  }

  const byPhase = [...phaseCounts.entries()]
    .map(([phase, count]) => ({ phase, count }))
    .sort((a, b) => PHASE_RANK[b.phase] - PHASE_RANK[a.phase]);

  const roleTasks = [...roleMap.entries()].map(([role, tasks]) => ({ role, tasks }));

  if (unrecognized > 0) {
    alerts.push(`${unrecognized} notification(s) could not be classified — review manually.`);
  }

  return {
    total: records.length - unrecognized,
    unrecognized,
    byPriority,
    byPhase,
    roleTasks,
    alerts,
  };
}

const PRIORITY_LABEL: Record<WorkflowPriority, string> = {
  CRITICAL: "🔴 CRITICAL",
  HIGH: "🟡 HIGH",
  NORMAL: "🟢 NORMAL",
  APPLICANT: "🔵 APPLICANT",
};

/** Plain-text rendering of the report (for the summary panel and copy/export). */
export function formatReportText(report: WorkflowReport): string {
  const lines: string[] = [];
  lines.push("RAIS LICENSING STATUS UPDATE");
  lines.push(
    `${report.total} applications tracked · ${report.byPriority.CRITICAL.length} critical · ` +
      `${report.byPriority.HIGH.length} high · ${report.byPriority.APPLICANT.length} awaiting applicant`,
  );
  lines.push("");

  const order: WorkflowPriority[] = ["CRITICAL", "HIGH", "NORMAL", "APPLICANT"];
  for (const p of order) {
    const items = report.byPriority[p];
    if (!items.length) continue;
    lines.push(`${PRIORITY_LABEL[p]} (${items.length})`);
    for (const r of items) {
      const flags = [
        r.outstandingPayment ? "⚠ payment" : "",
        r.bottleneck ? "⛔ bottleneck" : "",
      ]
        .filter(Boolean)
        .join(" ");
      lines.push(
        `  • ${r.facilityName || "(unmatched)"} — ${r.ran} · ${r.stage} → ${r.responsibleParty}${flags ? " · " + flags : ""}`,
      );
    }
    lines.push("");
  }

  if (report.alerts.length) {
    lines.push("DEPENDENCY & BOTTLENECK ALERTS");
    for (const a of report.alerts) lines.push(`  ! ${a}`);
    lines.push("");
  }

  lines.push("ROLE-BASED TASKS");
  for (const { role, tasks } of report.roleTasks) {
    lines.push(`  ${role}`);
    for (const t of tasks) lines.push(`    - ${t}`);
  }

  return lines.join("\n");
}
