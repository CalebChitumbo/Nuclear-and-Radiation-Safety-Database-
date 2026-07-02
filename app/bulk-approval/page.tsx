"use client";

import { memo, useCallback, useMemo, useState } from "react";

import { useAuth } from "@/lib/auth";
import { isMockMode } from "@/lib/firebase";
import { store } from "@/lib/store";
import { useStoreData } from "@/lib/storeHooks";
import { FacilitySelect } from "@/components/FacilitySelect";
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

  const targetWeek = useMemo(() => weekLabelForDate(date, weeks, ""), [
    date,
    weeks,
  ]);

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
        m.classification === "none"
          ? "create"
          : "include";
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
    setRows((r) =>
      r.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    );
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
            r.decision === "create" ||
            (r.decision === "include" && r.matchId),
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
      <div className="card p-6 text-sm">
        Only Authorisation &amp; Standards officers (or admins) can record
        licences.
      </div>
    );
  }

  return (
    <div className="space-y-4 staggered">
      <div className="card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[280px]">
            <label className="caps text-[10px] text-gunmetal/60">
              Paste approved licences (one per line)
            </label>
            <textarea
              className="input mt-1 font-mono-nums"
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Friends Care Medical Centre | AUTH/USE.REN/0781\nHitachi Construction ... | AUTH/IMP/0150\nNew Importer | AUTH/IMP/0200`}
            />
            <div className="text-[11px] text-gunmetal/55 mt-1">
              A pipe (<code>|</code>) always splits the number. A comma only
              splits when the tail looks like an AUTH/FAC code (commas in
              facility names are safe).
            </div>
          </div>
          <div>
            <label className="caps text-[10px] text-gunmetal/60">
              Date issued
            </label>
            <input
              type="date"
              className="input mt-1"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <div className="text-[11px] text-gunmetal/55 mt-1">
              Lands in: <strong>{targetWeek || "(no week match)"}</strong>
            </div>
          </div>
          <div>
            <label className="caps text-[10px] text-gunmetal/60">
              Default type
            </label>
            <select
              className="input mt-1"
              value={defaultType}
              onChange={(e) => setDefaultType(e.target.value as LicenceType)}
            >
              {LICENCE_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-primary"
            onClick={parseAndMatch}
            disabled={!facilities}
          >
            Match
          </button>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gunmetal/8 flex items-center justify-between">
            <div className="font-black">Review</div>
            <div className="text-xs text-gunmetal/60">
              {rows.length} lines · {rows.filter((r) => r.decision !== "skip").length} to
              commit · {rows.filter((r) => r.decision === "create").length} new
              facilities · {rows.filter((r) => r.decision === "skip").length} skipped
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs caps text-gunmetal/55">
                  <th className="px-4 py-2">Pasted line</th>
                  <th className="px-4 py-2">Matched facility</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Effect</th>
                  <th className="px-4 py-2">Decision</th>
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
          <div className="p-5 flex flex-wrap items-center gap-3 border-t border-gunmetal/8">
            <button
              className="btn btn-primary"
              disabled={committing || rows.every((r) => r.decision === "skip")}
              onClick={commit}
            >
              {committing
                ? "Committing…"
                : `Commit ${rows.filter((r) => r.decision !== "skip").length} licences`}
            </button>
            <button className="btn btn-ghost" onClick={() => setRows([])}>
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {summary ? (
        <div className="card p-5 bg-mist">
          <div className="caps text-xs text-gunmetal/60">Commit summary</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
            <SummaryCell
              label="Newly licensed"
              value={summary.newLicensed}
              accent="green"
            />
            <SummaryCell label="Renewals" value={summary.renewals} />
            <SummaryCell
              label="Other authorisations"
              value={summary.otherAuths}
              accent="slate"
            />
            <SummaryCell
              label="Skipped"
              value={summary.skipped}
              accent="red"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function effectFor(type: LicenceType, fac: Facility | null, isCreate: boolean): {
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

const ReviewRowEditor = memo(function ReviewRowEditor({
  index,
  row,
  facilities,
  onChangeRow,
}: {
  index: number;
  row: ReviewRow;
  facilities: Facility[];
  onChangeRow: (idx: number, p: Partial<ReviewRow>) => void;
}) {
  const onChange = (p: Partial<ReviewRow>) => onChangeRow(index, p);
  const fac = row.matchId
    ? facilities.find((f) => f.id === row.matchId) || null
    : null;
  const eff = effectFor(row.type, fac, row.decision === "create");
  const confidencePct = (row.score * 100).toFixed(0);
  const confidenceLabel =
    classifyMatch(row.score) === "auto" ? "Auto" : "Likely";

  return (
    <tr className="border-t border-gunmetal/8 align-top">
      <td className="px-4 py-3">
        <div className="font-bold">{row.name || <em>(blank)</em>}</div>
        <div className="text-xs tabular text-gunmetal/60">
          {row.number || "no number"}
        </div>
      </td>
      <td className="px-4 py-3">
        {row.decision === "create" ? (
          <div className="space-y-2">
            <div className="chip yellow">Create new facility</div>
            <div className="grid grid-cols-2 gap-1.5">
              <select
                className="input"
                value={row.createDraft?.province}
                onChange={(e) =>
                  onChange({
                    createDraft: {
                      ...(row.createDraft as ReviewRow["createDraft"])!,
                      province: e.target.value as Province,
                    },
                  })
                }
              >
                {PROVINCES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <select
                className="input"
                value={row.createDraft?.sector}
                onChange={(e) =>
                  onChange({
                    createDraft: {
                      ...(row.createDraft as ReviewRow["createDraft"])!,
                      sector: e.target.value as Sector,
                    },
                  })
                }
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
                onChange={(e) =>
                  onChange({
                    createDraft: {
                      ...(row.createDraft as ReviewRow["createDraft"])!,
                      practice: e.target.value,
                    },
                  })
                }
              />
              <input
                className="input"
                placeholder="District"
                aria-label="District"
                value={row.createDraft?.district}
                onChange={(e) =>
                  onChange({
                    createDraft: {
                      ...(row.createDraft as ReviewRow["createDraft"])!,
                      district: e.target.value,
                    },
                  })
                }
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
        )}
      </td>
      <td className="px-4 py-3">
        <select
          className="input"
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
      </td>
      <td className="px-4 py-3">
        <span className={`chip ${eff.variant}`}>{eff.label}</span>
      </td>
      <td className="px-4 py-3">
        <div className="inline-flex rounded-lg overflow-hidden border border-gunmetal/10">
          {(["include", "create", "skip"] as RowDecision[]).map((d) => {
            const disabled =
              d === "include" && !row.matchId;
            return (
              <button
                key={d}
                disabled={disabled}
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
                className="px-3 py-1.5 text-xs caps font-bold"
                style={{
                  background:
                    row.decision === d ? "var(--rpa-green)" : "transparent",
                  color:
                    row.decision === d ? "white" : "var(--gunmetal)",
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                {d}
              </button>
            );
          })}
        </div>
      </td>
    </tr>
  );
});

function SummaryCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "green" | "slate" | "red";
}) {
  return (
    <div>
      <div className="caps text-[10px] text-gunmetal/60">{label}</div>
      <div
        className={`text-3xl font-black tabular ${
          accent === "green"
            ? "text-[var(--rpa-green-dark)]"
            : accent === "slate"
              ? "text-[var(--status-info)]"
              : accent === "red"
                ? "text-[var(--status-stalled)]"
                : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
