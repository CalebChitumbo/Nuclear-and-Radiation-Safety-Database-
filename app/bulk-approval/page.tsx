"use client";

import { memo, useCallback, useMemo, useState } from "react";

import { useAuth } from "@/lib/auth";
import { isMockMode } from "@/lib/firebase";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { FacilitySelect } from "@/components/FacilitySelect";
import { Kpi } from "@/components/Kpi";
import { Panel } from "@/components/Section";
import { useToast } from "@/components/Toast";
import { useWeek } from "@/lib/weekContext";
import { detectType } from "@/lib/rules/detectType";
import { classifyMatch, matchOne, parseBulkLine } from "@/lib/rules/matching";
import { todayISO, weekLabelForDate } from "@/lib/rules/week";
import {
  isUseP,
  LICENCE_TYPES,
  PROVINCES,
  SECTORS,
  type Facility,
  type LicenceType,
  type Province,
  type Sector,
} from "@/lib/rules/types";

type RowDecision = "include" | "skip" | "create";

interface ReviewRow {
  index: number;
  name: string;
  number: string;
  matchId: string | null;
  matchName: string;
  score: number;
  type: LicenceType;
  detected: LicenceType;
  decision: RowDecision;
  createDraft?: {
    sector: Sector;
    province: Province;
    practice: string;
    district: string;
  };
}

export default function BulkApprovalPage() {
  const { user, canEditAS } = useAuth();
  const { weeks } = useWeek();
  const toast = useToast();
  const { data: facilities, reload } = useStoreData(
    async (s) => s.listFacilities(),
    [],
  );

  // Demo lines only in mock mode: a production paste box must never ship
  // pre-filled with fake licences one stray "Commit" would record.
  const [text, setText] = useState(
    isMockMode
      ? "Friends Care Medical Centre | AUTH/USE.REN/0781\nHitachi Construction Machinery Zambia Limited | AUTH/IMP/0150\nBrand New Medical Center | AUTH/USE.NEW/0900"
      : "",
  );
  const [date, setDate] = useState(() => todayISO());
  const [defaultType, setDefaultType] = useState<LicenceType>(
    "New Use/Possession Licence",
  );
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [committing, setCommitting] = useState(false);
  const [summary, setSummary] = useState<{
    newLicensed: number;
    renewals: number;
    otherAuths: number;
    skipped: number;
  } | null>(null);

  const targetWeek = useMemo(
    () => weekLabelForDate(date, weeks, ""),
    [date, weeks],
  );

  const parseAndMatch = () => {
    if (!facilities) return;
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const newRows: ReviewRow[] = lines.map((line, i) => {
      const parsed = parseBulkLine(line);
      const m = matchOne(parsed, facilities);
      const detected = detectType(parsed.number, defaultType);
      const decision: RowDecision =
        m.classification === "none" ? "create" : "include";
      return {
        index: i,
        name: parsed.name,
        number: parsed.number,
        matchId: m.best ? m.best.id : null,
        matchName: m.best ? m.best.name : "",
        score: m.score,
        type: detected,
        detected,
        decision,
        createDraft:
          decision === "create"
            ? {
                sector: "Private",
                province: "Lusaka",
                practice: "",
                district: "",
              }
            : undefined,
      };
    });
    setRows(newRows);
    setSummary(null);
  };

  const updateRow = useCallback((idx: number, patch: Partial<ReviewRow>) => {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }, []);

  const commit = async () => {
    if (!user) return;
    setCommitting(true);
    try {
      // An "include" row without a matched facility must never commit — with
      // facilityId null and no draft it would create a blank-named facility.
      const inputs = rows
        .filter(
          (r) =>
            r.decision === "create" || (r.decision === "include" && r.matchId),
        )
        .map((r) => ({
          facilityId: r.decision === "create" ? null : r.matchId,
          number: r.number,
          type: r.type,
          date,
          newFacilityDraft:
            r.decision === "create"
              ? {
                  name: r.name,
                  sector: r.createDraft?.sector,
                  province: r.createDraft?.province,
                  practice: r.createDraft?.practice,
                  district: r.createDraft?.district,
                }
              : undefined,
        }));

      const s = await store();
      const result = await s.recordLicences(inputs, user.uid);
      const skipped = rows.length - inputs.length;
      setSummary({ ...result.summary, skipped });
      toast.push(
        `${result.eventIds.length} licences recorded → register & week ${targetWeek || "—"} updated.`,
        "success",
      );
      setRows([]);
      reload();
    } catch (err) {
      toast.push(
        `Commit failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setCommitting(false);
    }
  };

  if (!canEditAS) {
    return (
      <Panel>
        <p className="text-sm">
          Only Authorisation &amp; Standards officers (or admins) can record
          licences.
        </p>
      </Panel>
    );
  }

  const toCommit = rows.filter((r) => r.decision !== "skip").length;

  return (
    <div className="space-y-4 staggered">
      <Panel title="Paste approved licences">
        <div className="space-y-3">
          <div>
            <label className="field-label" htmlFor="bulk-text">
              One licence per line
            </label>
            <textarea
              id="bulk-text"
              className="input font-mono-nums"
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Friends Care Medical Centre | AUTH/USE.REN/0781\nHitachi Construction ... | AUTH/IMP/0150\nNew Importer | AUTH/IMP/0200`}
            />
            <p className="text-[11px] text-gunmetal/55 mt-1">
              A pipe (<code>|</code>) always splits the number. A comma only
              splits when the tail looks like an AUTH/FAC code (commas in
              facility names are safe).
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="bulk-date">
                Date issued
              </label>
              <input
                id="bulk-date"
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <p className="text-[11px] text-gunmetal/55 mt-1">
                Lands in: <strong>{targetWeek || "(no week match)"}</strong>
              </p>
            </div>
            <div>
              <label className="field-label" htmlFor="bulk-type">
                Default type
              </label>
              <select
                id="bulk-type"
                className="input"
                value={defaultType}
                onChange={(e) => setDefaultType(e.target.value as LicenceType)}
              >
                {LICENCE_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            className="btn btn-primary w-full sm:w-auto"
            onClick={parseAndMatch}
            disabled={!facilities}
          >
            Match against the register
          </button>
        </div>
      </Panel>

      {rows.length > 0 ? (
        <Panel
          title="Review"
          note={`${rows.length} lines · ${toCommit} to commit · ${
            rows.filter((r) => r.decision === "create").length
          } new facilities · ${
            rows.filter((r) => r.decision === "skip").length
          } skipped`}
          flush
        >
          {/* Desktop: the full review grid */}
          <div className="hidden lg:block table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Pasted line</th>
                  <th>Matched facility</th>
                  <th>Type</th>
                  <th>Effect</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <ReviewRowEditor
                    key={i}
                    index={i}
                    row={r}
                    facilities={facilities || []}
                    onChangeRow={updateRow}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone & tablet: one stacked block per pasted line */}
          <ul className="lg:hidden divide-y divide-gunmetal/8">
            {rows.map((r, i) => (
              <ReviewCardEditor
                key={i}
                index={i}
                row={r}
                facilities={facilities || []}
                onChangeRow={updateRow}
              />
            ))}
          </ul>

          <div className="px-4 sm:px-5 pt-4 flex flex-wrap items-center gap-2 border-t border-gunmetal/8 mt-4">
            <button
              className="btn btn-primary flex-1 sm:flex-none"
              disabled={committing || rows.every((r) => r.decision === "skip")}
              onClick={commit}
            >
              {committing ? "Committing…" : `Commit ${toCommit} licences`}
            </button>
            <button className="btn btn-ghost" onClick={() => setRows([])}>
              Clear
            </button>
          </div>
        </Panel>
      ) : null}

      {summary ? (
        <Panel title="Commit summary">
          <div className="stat-grid grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Newly licensed"
              value={summary.newLicensed}
              accent="green"
            />
            <Kpi label="Renewals" value={summary.renewals} />
            <Kpi
              label="Other authorisations"
              value={summary.otherAuths}
              accent="slate"
            />
            <Kpi label="Skipped" value={summary.skipped} accent="red" />
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function effectFor(
  type: LicenceType,
  fac: Facility | null,
  isCreate: boolean,
): {
  label: string;
  variant: "green" | "amber" | "slate" | "red";
} {
  if (isCreate) {
    if (isUseP(type)) {
      return { label: "→ new facility (Licensed)", variant: "green" };
    }
    if (type === "Importation Licence") {
      return { label: "→ new facility (Import only)", variant: "slate" };
    }
    return { label: "→ new facility (Unlicensed)", variant: "red" };
  }
  if (!fac) return { label: "→ skipped", variant: "red" };
  if (isUseP(type)) {
    if (fac.licensed) return { label: "→ renewal logged", variant: "amber" };
    return { label: "→ becomes Licensed", variant: "green" };
  }
  return { label: "→ authorisation only", variant: "slate" };
}

interface EditorProps {
  index: number;
  row: ReviewRow;
  facilities: Facility[];
  onChangeRow: (idx: number, p: Partial<ReviewRow>) => void;
}

/** The controls shared by the desktop table row and the mobile block. */
function useRowParts({ index, row, facilities, onChangeRow }: EditorProps) {
  const onChange = (p: Partial<ReviewRow>) => onChangeRow(index, p);
  const fac = row.matchId
    ? facilities.find((f) => f.id === row.matchId) || null
    : null;
  const eff = effectFor(row.type, fac, row.decision === "create");
  const confidencePct = (row.score * 100).toFixed(0);
  const confidenceLabel =
    classifyMatch(row.score) === "auto" ? "Auto" : "Likely";

  const setDraft = (patch: Partial<NonNullable<ReviewRow["createDraft"]>>) =>
    onChange({
      createDraft: {
        ...(row.createDraft as NonNullable<ReviewRow["createDraft"]>),
        ...patch,
      },
    });

  const match =
    row.decision === "create" ? (
      <div className="space-y-2">
        <div className="chip yellow">Create new facility</div>
        <div className="grid grid-cols-2 gap-2">
          <select
            className="input"
            aria-label="Province"
            value={row.createDraft?.province}
            onChange={(e) => setDraft({ province: e.target.value as Province })}
          >
            {PROVINCES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Sector"
            value={row.createDraft?.sector}
            onChange={(e) => setDraft({ sector: e.target.value as Sector })}
          >
            {SECTORS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Practice"
            aria-label="Practice"
            value={row.createDraft?.practice}
            onChange={(e) => setDraft({ practice: e.target.value })}
          />
          <input
            className="input"
            placeholder="District"
            aria-label="District"
            value={row.createDraft?.district}
            onChange={(e) => setDraft({ district: e.target.value })}
          />
        </div>
      </div>
    ) : (
      <div>
        <FacilitySelect
          facilities={facilities}
          value={row.matchId}
          onChange={(id) => {
            const m = id ? facilities.find((f) => f.id === id) : undefined;
            onChange({
              matchId: id,
              matchName: m ? m.name : "",
              score: 1,
              // An include-row stripped of its match must not stay
              // committable — it would create a blank facility.
              decision:
                !id && row.decision === "include" ? "skip" : row.decision,
            });
          }}
        />
        <div className="text-xs text-gunmetal/60 mt-1">
          {row.matchName ? (
            <>
              {confidenceLabel} ·{" "}
              <span className="tabular">{confidencePct}%</span>
              {fac?.licensed ? " · already licensed" : ""}
            </>
          ) : (
            "—"
          )}
        </div>
      </div>
    );

  const typePicker = (
    <>
      <select
        className="input"
        aria-label="Licence type"
        value={row.type}
        onChange={(e) => onChange({ type: e.target.value as LicenceType })}
      >
        {LICENCE_TYPES.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
      {row.detected !== row.type ? (
        <div className="text-[11px] text-gunmetal/55 mt-1">
          (auto-detected: {row.detected})
        </div>
      ) : null}
    </>
  );

  const effect = <span className={`chip ${eff.variant}`}>{eff.label}</span>;

  const decision = (
    <div className="seg">
      {(["include", "create", "skip"] as RowDecision[]).map((d) => (
        <button
          key={d}
          className="seg-btn"
          disabled={d === "include" && !row.matchId}
          aria-pressed={row.decision === d}
          onClick={() =>
            onChange({
              decision: d,
              createDraft:
                d === "create"
                  ? row.createDraft || {
                      sector: "Private",
                      province: "Lusaka",
                      practice: "",
                      district: "",
                    }
                  : row.createDraft,
            })
          }
        >
          {d}
        </button>
      ))}
    </div>
  );

  return { match, typePicker, effect, decision };
}

const ReviewRowEditor = memo(function ReviewRowEditor(props: EditorProps) {
  const { row } = props;
  const { match, typePicker, effect, decision } = useRowParts(props);
  return (
    <tr>
      <td>
        <div className="font-bold">{row.name || <em>(blank)</em>}</div>
        <div className="text-xs tabular text-gunmetal/60">
          {row.number || "no number"}
        </div>
      </td>
      <td style={{ minWidth: 220 }}>{match}</td>
      <td style={{ minWidth: 180 }}>{typePicker}</td>
      <td>{effect}</td>
      <td>{decision}</td>
    </tr>
  );
});

const ReviewCardEditor = memo(function ReviewCardEditor(props: EditorProps) {
  const { row } = props;
  const { match, typePicker, effect, decision } = useRowParts(props);
  return (
    <li className="px-4 sm:px-5 py-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold break-words">
            {row.name || <em>(blank)</em>}
          </div>
          <div className="text-xs tabular text-gunmetal/60">
            {row.number || "no number"}
          </div>
        </div>
        {effect}
      </div>
      <div>
        <div className="field-label">Matched facility</div>
        {match}
      </div>
      <div>
        <div className="field-label">Licence type</div>
        {typePicker}
      </div>
      <div>
        <div className="field-label">Decision</div>
        {decision}
      </div>
    </li>
  );
});
