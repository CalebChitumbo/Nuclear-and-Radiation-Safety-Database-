"use client";

import { useMemo, useState } from "react";

import { Panel } from "@/components/Section";
import { useToast } from "@/components/Toast";
import { store } from "@/lib/store";
import {
  WORK_PLAN,
  WORK_PLAN_OPENING_BALANCE,
  effectiveOpeningBalance,
  parseOpeningBalance,
  type Subprogramme,
  type WorkPlanOutput,
} from "@/lib/rules/workPlan";
import type { WorkPlanBaseline } from "@/lib/rules/types";

/**
 * The opening balance — what each work plan output had already achieved before
 * the system started counting it.
 *
 * The report is cumulative for the plan year, so this is what every row counts
 * up from: a section already at 357 licences when it came onto the system
 * reports 358 once the next one is logged, not 1. The figures ship with each
 * section's own actuals as at the last data update; this panel is how an
 * officer corrects them or re-baselines the year.
 *
 * An output whose history the system actually holds carries nothing in — the
 * screened-vehicles row (1.3.12) counts the seeded daily log rather than a
 * lump sum — so a zero here is a deliberate figure, not a gap.
 *
 * Only admins may write it — it moves every section's reported figures at once.
 * Everyone else sees what is in force and where it came from.
 */
export function OpeningBalancePanel({
  year,
  plan,
  baseline,
  canEdit,
  uid,
  onSaved,
}: {
  year: number;
  /**
   * The plan in force — the approved workbook with the sections' own changes
   * laid over it. A row a section added carries an opening balance like any
   * other, so this panel lists what the report lists, not what the code ships.
   */
  plan?: Subprogramme[];
  /** The saved baseline, or null when the workbook's figures still apply. */
  baseline: WorkPlanBaseline | null;
  canEdit: boolean;
  uid: string;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, number[]> | null>(null);
  const [paste, setPaste] = useState("");
  const [pasteReport, setPasteReport] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inForce = useMemo(
    () => effectiveOpeningBalance(baseline?.values ?? null, plan),
    [baseline, plan],
  );
  const values = draft ?? inForce;

  const grandTotal = Object.values(inForce).reduce(
    (sum, q) => sum + q.reduce((a, b) => a + b, 0),
    0,
  );

  const setQuarter = (id: string, index: number, raw: string) => {
    const n = Number(raw);
    const value = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    setDraft((cur) => {
      const next = { ...(cur ?? inForce) };
      const quarters = [...(next[id] || [0, 0, 0, 0])];
      quarters[index] = value;
      next[id] = quarters;
      return next;
    });
  };

  const readPaste = () => {
    const { values: parsed, matched, skipped } = parseOpeningBalance(paste);
    if (!matched.length) {
      setPasteReport(
        "No work plan outputs found in that text. Each line needs to start with an output id such as 1.2.4.",
      );
      return;
    }
    // Pasting a few rows corrects those outputs; it does not wipe the rest.
    setDraft({ ...(draft ?? inForce), ...parsed });
    setPasteReport(
      `Read ${matched.length} output${matched.length === 1 ? "" : "s"}: ${matched.join(", ")}.` +
        (skipped.length
          ? ` ${skipped.length} line${skipped.length === 1 ? "" : "s"} skipped (no output id).`
          : ""),
    );
    setPaste("");
  };

  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const s = await store();
      await s.setWorkPlanBaseline(year, draft, uid);
      toast.push("Opening balance saved.", "success");
      setDraft(null);
      setPasteReport(null);
      onSaved();
    } catch (err) {
      toast.push(
        `Saving the opening balance failed: ${
          err instanceof Error ? err.message : err
        }`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const provenance = baseline?.updatedAt
    ? `Saved ${baseline.updatedAt.slice(0, 10)}`
    : `From each section's ${year} workbook`;

  return (
    <Panel
      title={`Opening balance — ${year}`}
      note={`What each output had already achieved before the system started counting it. Everything logged from now adds on top. ${provenance}; ${grandTotal.toLocaleString()} counted in across the plan.`}
      action={
        <button
          className="link-action no-print"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Hide" : canEdit ? "Set the figures" : "View the figures"}
        </button>
      }
      flush
    >
      {open ? (
        <div className="px-4 sm:px-5 space-y-4">
          {canEdit ? (
            <>
              <div className="rounded-lg bg-[var(--sunken)] p-3 text-sm text-gunmetal/70">
                <p>
                  These figures cover work the registers do <strong>not</strong>{" "}
                  hold. If you ever back-import the same licences or inspections,
                  zero that output here first or it will be counted twice.
                </p>
              </div>

              <div>
                <label className="field-label" htmlFor="ob-paste">
                  Paste rows from the work plan spreadsheet
                </label>
                <textarea
                  id="ob-paste"
                  className="input font-mono text-xs"
                  rows={4}
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder={
                    "Copy the rows straight out of Excel, or type one output per line:\n1.2.4\t40\t96\t0\t0"
                  }
                />
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button
                    className="btn btn-secondary"
                    onClick={readPaste}
                    disabled={!paste.trim()}
                  >
                    Read the paste
                  </button>
                  <span className="text-xs text-gunmetal/60">
                    An output id, then its Q1–Q4 figures. Pasted rows update
                    those outputs only.
                  </span>
                </div>
                {pasteReport ? (
                  <p className="text-xs text-gunmetal/70 mt-2">{pasteReport}</p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-gunmetal/60">
              Only an administrator can change the opening balance — it moves
              every section&apos;s reported figures at once.
            </p>
          )}

          <div className="table-wrap">
            <table className="data" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Output</th>
                  <th>Description</th>
                  <th className="num">Q1</th>
                  <th className="num">Q2</th>
                  <th className="num">Q3</th>
                  <th className="num">Q4</th>
                  <th className="num">Carried in</th>
                </tr>
              </thead>
              <tbody>
                {(plan ?? WORK_PLAN).map((sub) => (
                  <BalanceRows
                    key={sub.id}
                    heading={sub.heading}
                    outputs={sub.outputs}
                    values={values}
                    canEdit={canEdit}
                    onChange={setQuarter}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {canEdit ? (
            <div className="flex flex-wrap gap-2 pb-1">
              <button
                className="btn btn-primary"
                onClick={save}
                disabled={busy || !draft}
              >
                {busy ? "Saving…" : "Save opening balance"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setDraft(null);
                  setPasteReport(null);
                }}
                disabled={!draft}
              >
                Discard changes
              </button>
              <button
                className="btn btn-ghost"
                onClick={() =>
                  setDraft(
                    effectiveOpeningBalance(WORK_PLAN_OPENING_BALANCE, plan),
                  )
                }
              >
                Reset to the sections' workbooks
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setDraft(effectiveOpeningBalance({}, plan))}
              >
                Clear to zero
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function BalanceRows({
  heading,
  outputs,
  values,
  canEdit,
  onChange,
}: {
  heading: string;
  outputs: WorkPlanOutput[];
  values: Record<string, number[]>;
  canEdit: boolean;
  onChange: (id: string, index: number, raw: string) => void;
}) {
  return (
    <>
      <tr>
        <td colSpan={7} className="bg-[var(--sunken)]">
          <span className="caps text-[10px] text-gunmetal/55">{heading}</span>
        </td>
      </tr>
      {outputs.map((o) => {
        const quarters = values[o.id] || [0, 0, 0, 0];
        const total = quarters.reduce((a, b) => a + b, 0);
        return (
          <tr key={o.id}>
            <td className="tabular font-bold whitespace-nowrap">{o.id}</td>
            <td>{o.description}</td>
            {quarters.map((v, i) => (
              <td key={i} className="num">
                {canEdit ? (
                  <input
                    type="number"
                    min={0}
                    className="input text-right"
                    style={{ maxWidth: 96, marginLeft: "auto" }}
                    aria-label={`${o.id} ${o.description} — opening Q${i + 1}`}
                    value={v}
                    onChange={(e) => onChange(o.id, i, e.target.value)}
                  />
                ) : (
                  <span className={v ? "font-bold" : "text-gunmetal/40"}>
                    {v ? v.toLocaleString() : "—"}
                  </span>
                )}
              </td>
            ))}
            <td className="num font-black">
              {total ? total.toLocaleString() : "—"}
            </td>
          </tr>
        );
      })}
    </>
  );
}
