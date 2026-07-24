import type { Facility } from "./types";

/** RFC-4180 escaping: quote when the value contains a comma, quote or newline. */
export function csvEscape(value: string): string {
  const s = value ?? "";
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows]
    .map((r) => r.map(csvEscape).join(","))
    .join("\r\n");
}

/**
 * Flatten register rows for export — one line per facility, mirroring the
 * columns the register table and reports filter on.
 */
export function facilitiesToCsv(facilities: Facility[]): string {
  const header = [
    "No",
    "Facility",
    "FAC Code",
    "District",
    "Province",
    "Practice",
    "Sector",
    "Category",
    "Functional",
    "Licensed",
    "Stage",
    "Stalled Application",
    "Needs Review",
    "Review Note",
    "Licence Numbers",
    "Import Detail",
  ];
  const rows = facilities.map((f, i) => [
    String(i + 1),
    f.name,
    f.facCode || "",
    f.district || "",
    f.province,
    f.practice || "",
    f.sector,
    f.category === "Non-Medical" ? "Non-Medical" : "Medical",
    f.functional === false ? "No" : "Yes",
    f.licensed ? "Yes" : "No",
    f.stage,
    f.stalled ? "Yes" : "",
    f.needsReview ? "Yes" : "",
    f.reviewNote || "",
    (f.auths || [])
      .map((a) => a.number)
      .filter(Boolean)
      .join("; "),
    f.statusDetail || "",
  ]);
  return toCsv(header, rows);
}
