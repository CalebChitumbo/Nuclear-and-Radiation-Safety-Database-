/**
 * Read-only forensics on the vehicles-screened figure (work plan output
 * 1.3.12) — who logged what, when they logged it, and what moved the total.
 *
 * Run it when the cumulative screening figure moves and nobody recognises the
 * movement. It reads `dailyEntries` and `workPlanBaseline` and writes nothing,
 * so it is safe to run against the live project at any time.
 *
 * Usage (live project):
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     npx tsx scripts/screening-audit.ts --since 2026-09-01
 *
 * Usage (local emulator):
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx scripts/screening-audit.ts
 *
 * Options
 *   --since <YYYY-MM-DD | ISO>  List every figure written on or after this
 *                               moment, and what the total was before it. This
 *                               is the "it was 353,000 on Tuesday and 362,000
 *                               on Wednesday" question — set it to Tuesday.
 *   --post "<name>"             Restrict to one inland office.
 *   --csv <path>                Write the full trail to a CSV file.
 *   --limit <n>                 Rows per listing (default 40).
 *   --include-imported          Include the workbook's own days in the
 *                               outlier listing (they are left out by
 *                               default - they are history, not suspects).
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync, writeFileSync } from "node:fs";

import { vehicleScreeningKey } from "../lib/rules/daily";
import {
  auditScreening,
  isSeeded,
  screeningEntriesToCsv,
} from "../lib/rules/screeningAudit";
import type { DailyEntry, WorkPlanBaseline } from "../lib/rules/types";
import {
  WORK_PLAN_OPENING_BALANCE,
  WORK_PLAN_YEAR,
} from "../lib/rules/workPlan";

const SCREENING_OUTPUT = "1.3.12";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function init() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    initializeApp({ credential: cert(JSON.parse(readFileSync(credPath, "utf-8"))) });
  } else {
    initializeApp();
  }
}

/** A bare date means the start of that day, in the local (Zambia) clock. */
function toInstant(raw: string): string {
  const value = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    console.error(`Could not read "${raw}" as a date or timestamp.`);
    process.exit(1);
  }
  return parsed.toISOString();
}

const n = (v: number) => v.toLocaleString();
const rule = (title: string) => console.log(`\n${title}\n${"-".repeat(title.length)}`);

function describe(e: DailyEntry): string {
  const written = e.createdAt ? e.createdAt.replace("T", " ").slice(0, 16) : "imported";
  const source = isSeeded(e) ? "workbook" : e.source === "scan-log" ? "scan log" : "typed";
  return [
    written.padEnd(17),
    e.date.padEnd(11),
    (e.border || "(no post)").padEnd(15),
    String(e.value ?? "").padStart(7),
    source.padEnd(9),
    e.updatedByName || e.updatedBy || "",
  ].join("  ");
}

const HEADER = [
  "written".padEnd(17),
  "day".padEnd(11),
  "post".padEnd(15),
  "value".padStart(7),
  "source".padEnd(9),
  "officer",
].join("  ");

async function main() {
  init();
  const db = getFirestore();
  const limit = Number(arg("limit") || 40);
  const post = arg("post");
  const since = arg("since") ? toInstant(arg("since") as string) : undefined;

  const snap = await db.collection("dailyEntries").get();
  const all: DailyEntry[] = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<DailyEntry, "id">) }),
  );

  // The opening balance in force: a saved baseline replaces the code figures
  // wholesale, so an unexplained jump can equally be someone re-baselining the
  // plan on /weekly rather than anyone logging a figure at all.
  const baselineDoc = await db
    .collection("workPlanBaseline")
    .doc(String(WORK_PLAN_YEAR))
    .get();
  const baseline = baselineDoc.exists ? (baselineDoc.data() as WorkPlanBaseline) : null;
  const opening =
    baseline?.values?.[SCREENING_OUTPUT] ?? WORK_PLAN_OPENING_BALANCE[SCREENING_OUTPUT];

  const scoped = post ? all.filter((e) => !e.border || e.border === post) : all;
  const audit = auditScreening({
    entries: scoped,
    metricKey: vehicleScreeningKey(),
    openingBalance: opening,
    since,
  });

  rule(`Vehicles screened (output ${SCREENING_OUTPUT})${post ? ` at ${post}` : ""}`);
  console.log(`Opening balance carried in   ${n(audit.openingBalance).padStart(10)}`);
  console.log(`Imported from the workbook   ${n(audit.seededTotal).padStart(10)}`);
  console.log(`Logged in the app            ${n(audit.loggedTotal).padStart(10)}`);
  console.log(`                             ${"=".repeat(10)}`);
  console.log(`Cumulative total             ${n(audit.grandTotal).padStart(10)}`);
  console.log(`\n${audit.entries.length} screening entries in ${snap.size} daily entries.`);
  if (baseline) {
    console.log(
      `\nOpening balance comes from a SAVED baseline (workPlanBaseline/${WORK_PLAN_YEAR}), ` +
        `not the code:\n  saved ${baseline.updatedAt || "?"} by ${baseline.updatedBy || "?"}` +
        `${baseline.note ? `\n  note: ${baseline.note}` : ""}`,
    );
  }

  rule("By post");
  const posts = Object.entries(audit.byBorder).sort((a, b) => b[1] - a[1]);
  for (const [name, total] of posts) {
    console.log(`  ${name.padEnd(18)}${n(total).padStart(10)}`);
  }
  if (audit.unspecified) {
    console.log(`  ${"(no post)".padEnd(18)}${n(audit.unspecified).padStart(10)}`);
  }

  rule("By account");
  for (const a of audit.actors) {
    console.log(
      `  ${a.name.padEnd(22)}${n(a.total).padStart(10)}  ${String(a.entries).padStart(5)} entries` +
        `  ${a.lastWrite ? `last ${a.lastWrite.slice(0, 16).replace("T", " ")}` : "imported"}` +
        `  ${a.borders.join(", ")}`,
    );
  }

  if (audit.change) {
    const c = audit.change;
    rule(`Written since ${arg("since")} (${c.from})`);
    console.log(
      `Total before  ${n(c.totalBefore)}\nAdded since   ${n(c.addedTotal)} in ${c.added.length} entries\n` +
        `Total now     ${n(c.totalAfter)}${
          audit.openingBalance
            ? `  (+ ${n(audit.openingBalance)} opening = ${n(audit.openingBalance + c.totalAfter)})`
            : ""
        }`,
    );
    if (c.added.length) {
      console.log(`\n${HEADER}`);
      for (const e of c.added.slice(0, limit)) console.log(describe(e));
      if (c.added.length > limit) console.log(`  … ${c.added.length - limit} more`);
    }
  }

  rule("Post-days counted more than once");
  if (!audit.duplicates.length) {
    console.log("  None — every post has one figure per day.");
  } else {
    console.log(
      `  ${audit.duplicates.length} post-days carry more than one figure, ` +
        `inflating the total by up to ${n(audit.duplicateExcess)}.\n`,
    );
    for (const d of audit.duplicates.slice(0, limit)) {
      console.log(
        `  ${d.border} ${d.date} — ${d.entries.length} figures, excess ${n(d.excess)}` +
          `${d.includesSeeded ? " (one is the workbook import)" : ""}`,
      );
      for (const e of d.entries) console.log(`      ${describe(e)}`);
    }
    if (audit.duplicates.length > limit) {
      console.log(`  … ${audit.duplicates.length - limit} more`);
    }
  }

  // The workbook's own busy days are history, not suspects, so they are left
  // out unless asked for - they would otherwise crowd out what was typed in.
  const includeImported = process.argv.includes("--include-imported");
  const outliers = includeImported
    ? audit.outliers
    : audit.outliers.filter((o) => !isSeeded(o.entry));

  rule("Figures far above that post's usual day");
  if (!outliers.length) {
    console.log("  None.");
  } else {
    console.log(`${HEADER}`);
    for (const o of outliers.slice(0, limit)) {
      console.log(`${describe(o.entry)}   ${o.factor.toFixed(1)}x the usual ${o.median}`);
    }
  }
  if (!includeImported && outliers.length < audit.outliers.length) {
    console.log(
      `  (${audit.outliers.length - outliers.length} imported workbook days also stand out - --include-imported lists them.)`,
    );
  }

  rule("Logged well after the day they report");
  if (!audit.backdated.length) {
    console.log("  None.");
  } else {
    console.log(`${HEADER}`);
    for (const b of audit.backdated.slice(0, limit)) {
      console.log(`${describe(b.entry)}   ${b.lagDays} days late`);
    }
    if (audit.backdated.length > limit) {
      console.log(`  … ${audit.backdated.length - limit} more`);
    }
  }

  const csv = arg("csv");
  if (csv) {
    writeFileSync(csv, screeningEntriesToCsv(audit.entries), "utf-8");
    console.log(`\nFull trail written to ${csv} (${audit.entries.length} rows).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
