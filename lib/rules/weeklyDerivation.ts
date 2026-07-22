import type {
  Inspection,
  InspectionType,
  LicenceEvent,
  LicenceType,
  Section,
} from "./types";

export interface MetricRow {
  key: string;
  label: string;
  auto: boolean;
  value: number;
}

export interface SectionReport {
  section: string;
  metrics: MetricRow[];
  total: { label: string; value: number } | null;
}

const AS_AUTO_METRICS: { label: string; match: (t: LicenceType) => boolean }[] = [
  {
    label: "Possession Licences issued",
    match: (t) =>
      t === "New Use/Possession Licence" ||
      t === "Renewal of Use/Possession Licence",
  },
  { label: "Importation Licences", match: (t) => t === "Importation Licence" },
  { label: "Export Licences", match: (t) => t === "Export Licence" },
  { label: "Transfer Licences", match: (t) => t === "Transfer Licence" },
  { label: "Transport Licences", match: (t) => t === "Transport Licence" },
  { label: "Transit Licences", match: (t) => t === "Transit Licence" },
  {
    label: "Variation of Terms and Conditions",
    match: (t) => t === "Variation of Terms and Conditions",
  },
  {
    label: "Design and Construction Licences",
    match: (t) => t === "Design and Construction Licence",
  },
  {
    label: "Decommissioning Licences",
    match: (t) => t === "Decommissioning Licence",
  },
];

const AS_MANUAL_METRICS = [
  "Stakeholder Engagements",
  "TWG Meetings attended",
];

const INSP_AUTO_METRICS: { label: string; type: InspectionType }[] = [
  { label: "Routine Inspections", type: "Routine Inspection" },
  { label: "Follow-ups", type: "Follow-up" },
  { label: "Pre-Authorisation Inspections", type: "Pre-Authorisation" },
  { label: "Investigations", type: "Investigation" },
  { label: "Enforcement Actions", type: "Enforcement Action" },
];

const INSP_MANUAL_METRICS = [
  "Stakeholder Engagements",
  "TWG Meetings attended",
];

const NSSS_MANUAL_METRICS = [
  "Vehicle Screening (units)",
  "IAEA Meetings attended",
  "Stakeholder Engagements",
  "TWG Meetings",
];

const NSI_MANUAL_METRICS = [
  "Facilities visited",
  "Sources inventoried",
  "Sources verified",
  "Discrepancies identified",
  "Team meetings held",
];

/**
 * The manual (typed-in) metrics each section reports, keyed by section. This is
 * the single list the weekly report AND the Daily Updates tab draw from, so a
 * daily count entry lands on exactly the metric key the weekly table sums.
 */
export const MANUAL_METRICS_BY_SECTION: Record<Section, readonly string[]> = {
  "Authorisation & Standards": AS_MANUAL_METRICS,
  Inspectorate: INSP_MANUAL_METRICS,
  "Nuclear Safety, Security & Safeguards": NSSS_MANUAL_METRICS,
  "National Source Inventory": NSI_MANUAL_METRICS,
};

export function sectionKey(section: string): string {
  return section
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

export function metricKey(section: string, label: string): string {
  return `${sectionKey(section)}::${label}`;
}

export function deriveWeekly(
  events: LicenceEvent[],
  inspections: Inspection[],
  manual: Record<string, number>,
): SectionReport[] {
  // Authorisation & Standards
  const asMetrics: MetricRow[] = AS_AUTO_METRICS.map((m) => ({
    key: metricKey("Authorisation & Standards", m.label),
    label: m.label,
    auto: true,
    value: events.filter((e) => m.match(e.type)).length,
  }));
  for (const label of AS_MANUAL_METRICS) {
    const key = metricKey("Authorisation & Standards", label);
    asMetrics.push({
      key,
      label,
      auto: false,
      value: manual[key] || 0,
    });
  }
  const asTotal = asMetrics
    .filter((m) => m.auto)
    .reduce((s, m) => s + m.value, 0);

  // Inspectorate
  const inspMetrics: MetricRow[] = INSP_AUTO_METRICS.map((m) => ({
    key: metricKey("Inspectorate", m.label),
    label: m.label,
    auto: true,
    value: inspections.filter((i) => i.type === m.type).length,
  }));
  for (const label of INSP_MANUAL_METRICS) {
    const key = metricKey("Inspectorate", label);
    inspMetrics.push({
      key,
      label,
      auto: false,
      value: manual[key] || 0,
    });
  }
  const inspTotal = inspMetrics
    .filter((m) => m.auto)
    .reduce((s, m) => s + m.value, 0);

  // Manual-only sections
  const nsssMetrics: MetricRow[] = NSSS_MANUAL_METRICS.map((label) => {
    const key = metricKey("Nuclear Safety, Security & Safeguards", label);
    return { key, label, auto: false, value: manual[key] || 0 };
  });
  const nsiMetrics: MetricRow[] = NSI_MANUAL_METRICS.map((label) => {
    const key = metricKey("National Source Inventory", label);
    return { key, label, auto: false, value: manual[key] || 0 };
  });

  return [
    {
      section: "Authorisation & Standards",
      metrics: asMetrics,
      total: { label: "Total Licences Issued", value: asTotal },
    },
    {
      section: "Inspectorate",
      metrics: inspMetrics,
      total: { label: "Total Inspections", value: inspTotal },
    },
    {
      section: "Nuclear Safety, Security & Safeguards",
      metrics: nsssMetrics,
      total: null,
    },
    {
      section: "National Source Inventory",
      metrics: nsiMetrics,
      total: null,
    },
  ];
}
