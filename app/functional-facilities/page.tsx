"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { downloadBinaryFile, downloadTextFile } from "@/components/downloadFile";
import { Kpi } from "@/components/Kpi";
import { LoadErrorBanner } from "@/components/LoadError";
import { DataRow, PageHeader, Panel } from "@/components/Section";
import { Segmented } from "@/components/Segmented";
import { EnforcementChip } from "@/components/inspectorate/InspectionDatabaseTable";
import { useStoreData } from "@/lib/storeHooks";
import type { EnforcementSeverity } from "@/lib/rules/enforcementStatus";
import { toCsv } from "@/lib/rules/exportCsv";
import {
  LICENSING_BUCKETS,
  STANDING_COLUMNS,
  bucketLabel,
  deriveFunctionalDashboard,
  functionalWorkbook,
  standingRows,
  type FacilityStanding,
  type LicensingBucketKey,
  type SectorView,
} from "@/lib/rules/functionalFacilities";
import { todayISO } from "@/lib/rules/week";
import { buildXlsx, XLSX_MIME } from "@/lib/rules/xlsx";
import { SECTORS, type Sector } from "@/lib/rules/types";

type SectorPick = Sector | "Both";
type BucketPick = "all" | "no-application" | "pipeline";
type ActionPick = "all" | EnforcementSeverity | "none";

const LIST_PAGE = 100;

/**
 * The licensing breakdown Management asked for at the September 2026
 * meeting: functional facilities only, public and private side by side, the
 * stages in Management's words, the private functional facilities without a
 * licence listed by name — and, against every unlicensed facility, what the
 * Authority has already done about it.
 *
 * Nothing is stored. The view is the register and the inspection register
 * read together, so marking a facility non-functional, moving its stage or
 * recording an enforcement action moves this page at once.
 */
export default function FunctionalFacilitiesPage() {
  const { data, error, reload } = useStoreData(async (s) => {
    const [facilities, inspections] = await Promise.all([
      s.listFacilities(),
      s.listInspections().catch(() => []),
    ]);
    return { facilities, inspections };
  }, []);

  const [sector, setSector] = useState<SectorPick>("Private");
  const [bucket, setBucket] = useState<BucketPick>("all");
  const [action, setAction] = useState<ActionPick>("all");
  const [limit, setLimit] = useState(LIST_PAGE);

  const dash = useMemo(
    () =>
      data ? deriveFunctionalDashboard(data.facilities, data.inspections) : null,
    [data],
  );

  const shown = useMemo(() => {
    if (!dash) return [] as FacilityStanding[];
    const rows = sector === "Both" ? dash.rows : dash.sectors[sector].rows;
    return rows.filter((r) => {
      if (bucket === "no-application" && r.bucket !== "no-application") return false;
      if (bucket === "pipeline" && r.bucket === "no-application") return false;
      if (action === "none" && r.enforcement) return false;
      if (action !== "all" && action !== "none" && r.enforcement?.severity !== action) {
        return false;
      }
      return true;
    });
  }, [dash, sector, bucket, action]);

  if (!dash) {
    return error ? (
      <LoadErrorBanner error={error} onRetry={reload} />
    ) : (
      <div className="caps text-xs text-gunmetal/60">Loading…</div>
    );
  }

  const today = todayISO();
  const exportWorkbook = () => {
    downloadBinaryFile(
      `functional-facilities-licensing-${today}.xlsx`,
      buildXlsx(functionalWorkbook(dash)),
      XLSX_MIME,
    );
  };
  const exportList = () => {
    const who = sector === "Both" ? "all" : sector.toLowerCase();
    downloadTextFile(
      `functional-${who}-unlicensed-${today}.csv`,
      toCsv(
        [...STANDING_COLUMNS],
        standingRows(shown).map((r) => r.map((c) => String(c ?? ""))),
      ),
    );
  };

  const pick = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setLimit(LIST_PAGE);
  };

  const listTitle =
    sector === "Both"
      ? `Functional facilities without a licence — ${shown.length}`
      : `${sector} functional facilities without a licence — ${shown.length}`;

  return (
    <div className="space-y-4 staggered">
      {error ? <LoadErrorBanner error={error} onRetry={reload} /> : null}

      <PageHeader
        eyebrow="Register"
        title="Functional facilities"
        subtitle={`Licensing status of the ${dash.functional.toLocaleString()} facilities that are operating — the ${dash.nonFunctional.toLocaleString()} non-functional facilities on the ${dash.registerTotal.toLocaleString()}-facility register are left out of every figure here.`}
        actions={
          <>
            <button className="btn btn-primary flex-1 sm:flex-none" onClick={exportWorkbook}>
              Excel workbook ↓
            </button>
            <Link
              className="btn btn-secondary flex-1 sm:flex-none"
              href="/facilities?func=functional"
            >
              Open in the register
            </Link>
          </>
        }
      />

      <section className="stat-grid bleed grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Functional facilities"
          value={dash.functional.toLocaleString()}
          caption={`of ${dash.registerTotal.toLocaleString()} on the register`}
        />
        <Kpi
          label="Licensed"
          value={dash.licensed.toLocaleString()}
          accent="green"
          caption={`${dash.coverage.toFixed(1)}% of functional`}
        />
        <Kpi
          label="Unlicensed"
          value={dash.unlicensed.toLocaleString()}
          accent="red"
          caption={`${dash.sectors.Public.unlicensed} public · ${dash.sectors.Private.unlicensed} private`}
        />
        <Kpi
          label="Private, no licence"
          value={dash.sectors.Private.unlicensed.toLocaleString()}
          accent="amber"
          caption={`${dash.sectors.Private.noApplication.total} with no application submitted`}
        />
      </section>

      {/* The breakdown Management asked for: functional only, public beside
          private, the stages in the meeting's words. */}
      <Panel
        title="Licensing status — functional facilities, public and private"
        flush
        note="Each stage folds the RAIS statuses named under it. Tap a status to open those facilities in the register."
      >
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Stage</th>
                <th className="num">Public</th>
                <th className="num">Private</th>
                <th className="num">Functional</th>
              </tr>
            </thead>
            <tbody>
              {LICENSING_BUCKETS.map((b) => (
                <BucketRow key={b.key} bucketKey={b.key} dash={dash} />
              ))}
              <tr className="font-black">
                <td>Total functional</td>
                <td className="num">{dash.sectors.Public.total}</td>
                <td className="num">{dash.sectors.Private.total}</td>
                <td className="num">{dash.functional}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Why a facility is under "no application" — the enforcement register
          read against the licensing register. */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title={`No application submitted — ${dash.noApplication.total}`}
          note="What the Authority has done about each one, from the inspection register. A suspended or closed practice is not simply “no application”."
        >
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Standing</th>
                  <th className="num">Public</th>
                  <th className="num">Private</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                <SplitRow
                  label="Restricted — practice or licence suspended, device seized, licence cancelled"
                  chip="red"
                  pick={(s) => s.noApplication.restricted}
                  dash={dash}
                  onPick={() => {
                    setSector("Both");
                    setBucket("no-application");
                    setAction("restricted");
                  }}
                />
                <SplitRow
                  label="Notice served — written warning or enforcement notice"
                  chip="red"
                  pick={(s) => s.noApplication.notice}
                  dash={dash}
                  onPick={() => {
                    setSector("Both");
                    setBucket("no-application");
                    setAction("notice");
                  }}
                />
                <SplitRow
                  label="Engagement only — facility, district or provincial level"
                  chip="amber"
                  pick={(s) => s.noApplication.engagement}
                  dash={dash}
                  onPick={() => {
                    setSector("Both");
                    setBucket("no-application");
                    setAction("engagement");
                  }}
                />
                <SplitRow
                  label="No action recorded"
                  chip="slate"
                  pick={(s) => s.noApplication.unexplained}
                  dash={dash}
                  onPick={() => {
                    setSector("Both");
                    setBucket("no-application");
                    setAction("none");
                  }}
                />
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="How the figures are read">
          <ul className="divide-y divide-gunmetal/8">
            <DataRow
              label="Register"
              value={dash.registerTotal.toLocaleString()}
              sub="Every facility, functional or not — what the Overview counts"
            />
            <DataRow
              label="Non-functional, excluded"
              value={dash.nonFunctional.toLocaleString()}
              sub="Marked on the facility record; a non-functional facility can still hold a licence"
              accent="red"
            />
            <DataRow
              label="Functional"
              value={dash.functional.toLocaleString()}
              sub="Everything on this page"
              accent="green"
            />
            <DataRow
              label="Public functional"
              value={`${dash.sectors.Public.licensed} / ${dash.sectors.Public.total}`}
              sub="licensed / total"
            />
            <DataRow
              label="Private functional"
              value={`${dash.sectors.Private.licensed} / ${dash.sectors.Private.total}`}
              sub="licensed / total"
            />
          </ul>
          <p className="text-[11px] text-gunmetal/55 mt-3">
            The enforcement standing is the latest action recorded against the
            facility on the Inspectorate tab. Record the action there and it
            shows here — nothing is typed twice.
          </p>
        </Panel>
      </section>

      {/* The list Management asked for by name. */}
      <Panel
        title={listTitle}
        flush
        action={
          <button className="link-action" onClick={exportList} disabled={shown.length === 0}>
            Export list (CSV) ↓
          </button>
        }
      >
        <div className="px-4 sm:px-5 pb-3 flex flex-wrap gap-x-6 gap-y-3">
          <div>
            <span className="field-label">Sector</span>
            <Segmented
              ariaLabel="Sector"
              value={sector}
              onChange={pick(setSector)}
              options={[
                ...SECTORS.map((s) => ({
                  value: s as SectorPick,
                  label: `${s} (${dash.sectors[s].unlicensed})`,
                })),
                { value: "Both" as SectorPick, label: `Both (${dash.unlicensed})` },
              ]}
            />
          </div>
          <div>
            <span className="field-label">Stage</span>
            <Segmented
              ariaLabel="Stage"
              value={bucket}
              onChange={pick(setBucket)}
              options={[
                { value: "all", label: "All" },
                { value: "no-application", label: "No application" },
                { value: "pipeline", label: "Application in progress" },
              ]}
            />
          </div>
          <div>
            <span className="field-label">Enforcement</span>
            <Segmented
              ariaLabel="Enforcement standing"
              value={action}
              onChange={pick(setAction)}
              options={[
                { value: "all", label: "All" },
                { value: "restricted", label: "Restricted" },
                { value: "notice", label: "Notice" },
                { value: "engagement", label: "Engagement" },
                { value: "none", label: "No action" },
              ]}
            />
          </div>
        </div>
        <div className="table-wrap">
          <table className="data tbl-sticky">
            <thead>
              <tr>
                <th>Facility</th>
                <th>Province · district</th>
                <th>Practice</th>
                <th>Licensing stage</th>
                <th>Enforcement standing</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, limit).map((r) => (
                <StandingRow key={r.facility.id} row={r} showSector={sector === "Both"} />
              ))}
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gunmetal/55">
                    No facilities match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {shown.length > limit ? (
          <div className="px-4 sm:px-5 py-3 border-t border-gunmetal/8">
            <button
              className="btn btn-ghost w-full sm:w-auto"
              onClick={() => setLimit(shown.length)}
            >
              Show all {shown.length} facilities
            </button>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function bucketOf(view: SectorView, key: LicensingBucketKey) {
  return view.buckets.find((b) => b.key === key);
}

/** One of Management's stages, with the RAIS statuses inside it underneath. */
function BucketRow({
  bucketKey,
  dash,
}: {
  bucketKey: LicensingBucketKey;
  dash: ReturnType<typeof deriveFunctionalDashboard>;
}) {
  const all = dash.buckets.find((b) => b.key === bucketKey);
  const pub = bucketOf(dash.sectors.Public, bucketKey);
  const priv = bucketOf(dash.sectors.Private, bucketKey);
  const stages = all?.stages || [];
  const lic = bucketKey === "licensed" ? "licensed" : "unlicensed";
  return (
    <tr>
      <td>
        <div className={bucketKey === "licensed" ? "font-bold text-[var(--rpa-green-dark)]" : "font-bold"}>
          {bucketLabel(bucketKey)}
        </div>
        {/* A bucket that folds several RAIS statuses says which — each links
            to the register filtered to functional facilities on that status. */}
        {stages.length > 1 || (stages.length === 1 && stages[0].stage !== bucketLabel(bucketKey)) ? (
          <div className="text-[11px] text-gunmetal/55 mt-0.5 flex flex-wrap gap-x-3">
            {stages.map((s) => (
              <Link
                key={s.stage}
                className="link-action text-[11px]"
                href={`/facilities?func=functional&lic=${lic}&stage=${encodeURIComponent(s.stage)}`}
              >
                {s.stage} ({s.total})
              </Link>
            ))}
          </div>
        ) : null}
      </td>
      <td className="num">{pub?.total || 0}</td>
      <td className="num">{priv?.total || 0}</td>
      <td className="num font-black">{all?.total || 0}</td>
    </tr>
  );
}

function SplitRow({
  label,
  chip,
  pick,
  dash,
  onPick,
}: {
  label: string;
  chip: "red" | "amber" | "slate";
  pick: (view: SectorView | ReturnType<typeof deriveFunctionalDashboard>) => number;
  dash: ReturnType<typeof deriveFunctionalDashboard>;
  onPick: () => void;
}) {
  return (
    <tr className="row-hover cursor-pointer" onClick={onPick}>
      <td>
        <span className={`chip ${chip} mr-2`}>●</span>
        <span className="text-sm">{label}</span>
      </td>
      <td className="num">{pick(dash.sectors.Public)}</td>
      <td className="num">{pick(dash.sectors.Private)}</td>
      <td className="num font-black">{pick(dash)}</td>
    </tr>
  );
}

function StandingRow({
  row,
  showSector,
}: {
  row: FacilityStanding;
  showSector: boolean;
}) {
  const f = row.facility;
  const e = row.enforcement;
  return (
    <tr>
      <td>
        <Link href={`/facilities/${f.id}`} className="font-bold link-action">
          {f.name}
        </Link>
        <div className="text-xs text-gunmetal/55 tabular">
          {f.facCode || "—"}
          {showSector ? ` · ${f.sector}` : ""}
          {" · "}
          {f.category === "Non-Medical" ? "Non-Medical" : "Medical"}
        </div>
      </td>
      <td>
        <div>{f.province}</div>
        <div className="text-xs text-gunmetal/55">{f.district || "—"}</div>
      </td>
      <td className="text-sm">{f.practice || "—"}</td>
      <td>
        <div className="text-sm font-bold">{bucketLabel(row.bucket)}</div>
        <div className="text-[11px] text-gunmetal/55">{f.currentStatus || f.stage}</div>
      </td>
      <td>
        {e ? (
          <div>
            <EnforcementChip action={e.action} />
            <div className="text-[11px] text-gunmetal/55 tabular mt-1">
              {e.date || "date not recorded"}
              {e.history.length > 1 ? ` · ${e.history.length} actions on record` : ""}
            </div>
          </div>
        ) : (
          <span className="text-xs text-gunmetal/45">No action recorded</span>
        )}
      </td>
    </tr>
  );
}
