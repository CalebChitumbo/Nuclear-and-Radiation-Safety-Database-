import { classifyMatch, matchOne } from "./matching";
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
}

/**
 * Ordered matchers (most specific first) mapping a notification title to its
 * pipeline meaning. Encodes the officer's RAIS triage prompt directly.
 */
const RULES: Array<{ test: RegExp; map: Mapping }> = [
  // --- Payment workflow -----------------------------------------------------
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
    test: /board licence approval|rpa board/i,
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
    test: /application submission form|new form i|new ionising radiation licence renewal request|new variation of terms|additional information|regulatory requirements|new licence|new ionising radiation licence request|notice of intention to decomiss/i,
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

const PHASE_RANK: Record<WorkflowPhase, number> = {
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
      return "Waiting for Payment";
    case "Accounts Clearance":
      return "Accounts Clearance Pending";
    case "RPA Receipt":
      return "Waiting for Review and Assessment";
    case "Review & Assessment":
      return "Under Review and Assessment";
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
    const map = classifyNotification(title);
    const rans = allRans(block);
    const ran = primaryRan(rans);
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
        { phase: r.phase, stage: r.stage, responsibleParty: r.responsibleParty, priority: r.priority, outstandingPayment: r.outstandingPayment },
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
    facilityStage: facilityStageFor(map.phase, map.stage),
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
    rec.facilityStage = facilityStageFor(map.phase, map.stage);
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
