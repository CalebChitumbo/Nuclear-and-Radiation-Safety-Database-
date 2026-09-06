/**
 * Load the inland offices' per-truck rows into the Border Scan Log.
 *
 * `scripts/import-inland-detail.py` reads the monthly workbooks and writes one
 * raw row per truck. This turns those rows into `truckScans` — through the
 * app's OWN rules (`buildScan`), so an imported scan is indistinguishable from
 * one an officer captures: the same canonical commodity and transporter
 * spellings, the same plate/chassis/VIN classification, the same dose triage,
 * the same reporting week. A second implementation here would drift.
 *
 * It does NOT touch the reported figures. Output 1.3.12 counts `dailyEntries`,
 * not scans, so importing 146,000 trucks moves no total — it gives the log its
 * history: search a plate, pull a post's day back up, see what the doses
 * actually looked like across a year.
 *
 * Ids are derived (`imp-<date>-<post>-<row>`), so re-running updates in place
 * and never doubles a day.
 *
 * Usage — reports and writes nothing without --apply:
 *   python3 scripts/import-inland-detail.py "INLAND DAILY ASSESSMENTS"
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     npx tsx scripts/upload-truck-scans.ts
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     npx tsx scripts/upload-truck-scans.ts --apply
 *
 * Options
 *   --apply          Actually write.
 *   --in <path>      The JSONL to read (default .import/inland-truck-scans-2026.jsonl).
 *   --post "<name>"  Restrict to one inland office.
 */
import { getFirestore } from "firebase-admin/firestore";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

import { initAdminApp } from "./adminApp";
import { borderId } from "../lib/rules/daily";
import { buildScan, type ScanDraft } from "../lib/rules/borderScans";
import { weekLabelForDate } from "../lib/rules/week";
import type { CargoClass } from "../lib/rules/borderCargo";
import type { TruckScan, WeekDef } from "../lib/rules/types";

const APPLY = process.argv.includes("--apply");
const BATCH = 400;

/**
 * Shown as the officer on an imported scan, and the account it is filed under.
 * `import` is one of the ids the audit log treats as a bulk load rather than
 * as somebody changing a figure — see BULK_IMPORT_ACTORS in lib/rules/auditLog.
 */
const IMPORT_UID = "import";
const IMPORT_NAME = "2026 monthly workbook";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

interface RawRow {
  date: string;
  border: string;
  row: number;
  vehicleId: string;
  cargoClass: string;
  commodity: string;
  transporter: string;
  dose: string;
}

/** `imp-2026-08-04-nakonde-17` — the post's day, and the row within it. */
function scanId(r: RawRow): string {
  return `imp-${r.date}-${borderId(r.border)}-${r.row}`;
}

async function main() {
  const path = arg("in") || ".import/inland-truck-scans-2026.jsonl";
  if (!existsSync(path)) {
    console.error(
      `No ${path}.\n\nGenerate it first:\n` +
        `  python3 scripts/import-inland-detail.py "INLAND DAILY ASSESSMENTS"\n`,
    );
    process.exit(1);
  }
  initAdminApp();
  const db = getFirestore();
  const onlyPost = arg("post");

  const weeks = JSON.parse(
    readFileSync(join(process.cwd(), "seed", "weeks-2026.seed.json"), "utf-8"),
  ) as WeekDef[];

  let read = 0;
  let skippedNoWeek = 0;
  const byPost = new Map<string, number>();
  const byResult = new Map<string, number>();
  let batch = db.batch();
  let inBatch = 0;
  let written = 0;

  const commit = async () => {
    if (!inBatch) return;
    if (APPLY) await batch.commit();
    written += inBatch;
    batch = db.batch();
    inBatch = 0;
    if (written % 20000 === 0) console.log(`  ${written.toLocaleString()}…`);
  };

  const lines = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as RawRow;
    if (onlyPost && r.border !== onlyPost) continue;
    read += 1;

    // A date outside the reporting calendar has nowhere to be counted, and a
    // scan with no week would be invisible to every rollup. Report, skip.
    const week = weekLabelForDate(r.date, weeks);
    if (!week) {
      skippedNoWeek += 1;
      continue;
    }

    const draft: ScanDraft = {
      vehicleId: r.vehicleId,
      commodity: r.commodity,
      cargoClass: r.cargoClass as CargoClass,
      transporter: r.transporter,
      dose: r.dose,
    };
    const scan = buildScan(draft, {
      date: r.date,
      week,
      border: r.border,
      officerUid: IMPORT_UID,
      officerName: IMPORT_NAME,
    }) as Omit<TruckScan, "id">;

    byPost.set(r.border, (byPost.get(r.border) || 0) + 1);
    byResult.set(scan.result, (byResult.get(scan.result) || 0) + 1);

    batch.set(db.doc(`truckScans/${scanId(r)}`), scan);
    inBatch += 1;
    if (inBatch >= BATCH) await commit();
  }
  await commit();

  console.log(
    `${APPLY ? "Wrote" : "Would write"} ${written.toLocaleString()} truck scans ` +
      `from ${read.toLocaleString()} rows.\n`,
  );
  for (const [post, count] of [...byPost.entries()].sort()) {
    console.log(`  ${post.padEnd(16)}${count.toLocaleString().padStart(9)}`);
  }
  console.log("\n  triage:");
  for (const [result, count] of [...byResult.entries()].sort()) {
    console.log(`    ${result.padEnd(10)}${count.toLocaleString().padStart(9)}`);
  }
  if (skippedNoWeek) {
    console.log(
      `\n  ${skippedNoWeek.toLocaleString()} row(s) fell outside the 2026 ` +
        `reporting calendar and were skipped.`,
    );
  }
  if (!APPLY) {
    console.log("\nNothing written. Re-run with --apply to load them.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
