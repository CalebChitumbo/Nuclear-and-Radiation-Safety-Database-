import type { FacilityEnforcement } from "./enforcementStatus";
import { LICENCE_STAGE_META, licenceStageOf } from "./licenceStage";
import { authWhen } from "./licenceStats";
import { isRecognisedProvider } from "./serviceProviders";
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
 * columns the register table and reports filter on. Pass the enforcement
 * standing (`enforcementByFacility`) and each line also says what the
 * Authority last did about the facility, and when.
 */
export function facilitiesToCsv(
  facilities: Facility[],
  enforcement?: Map<string, FacilityEnforcement>,
): string {
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
    "Licence Stage",
    "Stalled Application",
    "Needs Review",
    "Review Note",
    "Licence Numbers",
    "Licences Held",
    "Import Detail",
    "Service Provider",
    "Recognised by the Authority",
    "Recognised On",
    "Latest Enforcement Action",
    "Enforcement Date",
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
    LICENCE_STAGE_META[licenceStageOf(f)].label,
    f.stalled ? "Yes" : "",
    f.needsReview ? "Yes" : "",
    f.reviewNote || "",
    (f.auths || [])
      .map((a) => a.number)
      .filter(Boolean)
      .join("; "),
    // Every licence held, with when it was issued — a facility can hold
    // several, and the ones imported by quarter carry no number.
    (f.auths || [])
      .map((a) => {
        const when = authWhen(a);
        return when ? `${a.type} (${when})` : a.type;
      })
      .join("; "),
    f.statusDetail || "",
    f.serviceProvider ? "Yes" : "",
    f.serviceProvider ? (isRecognisedProvider(f) ? "Yes" : "No") : "",
    isRecognisedProvider(f) ? f.spRecognisedOn || "" : "",
    enforcement?.get(f.id)?.action || "",
    enforcement?.get(f.id)?.date || "",
  ]);
  return toCsv(header, rows);
}
