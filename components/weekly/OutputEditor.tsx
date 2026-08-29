"use client";

import { useMemo, useState } from "react";

import {
  breakdownForBinding,
  describeBinding,
  outputMetricKey,
  planOutputs,
  sameBinding,
  validateOutputEdit,
  type Subprogramme,
  type WorkPlanOutput,
} from "@/lib/rules/workPlan";
import {
  INSPECTION_TYPES,
  LICENCE_TYPES,
  SECTIONS,
  type InspectionType,
  type LicenceType,
  type Section,
  type SourceBinding,
  type WorkPlanOutputConfig,
} from "@/lib/rules/types";

/**
 * Editing one row of the work plan — the same form whether the row is being
 * corrected or added.
 *
 * Two things here are not ordinary form fields:
 *
 * - **The link.** Where a row's figure comes from is a value, not code (see
 *   `SourceBinding`), so it is edited like anything else: point a row at the
 *   licensing register and it counts licences as they are recorded; at the
 *   inspection register and it counts inspections; at another row's figure and
 *   the two report the same number without anyone copying it across. This is
 *   what keeps the sectional update talking to the rest of the database.
 * - **What gets saved.** Only what an officer actually changed is written
 *   (`entryFromDraft`), so a row that had its target revised still picks up the
 *   approved wording, and clearing the entry hands the row straight back to the
 *   plan Management approved.
 */

export interface OutputDraft {
  id: string;
  description: string;
  indicator: string;
  /** Blank means the workbook's "-" — no numeric target. */
  target: string;
  section: Section;
  note: string;
  logLabel: string;
  supporting: boolean;
  /** For a supporting figure: the output it is the detail of. */
  parentId: string;
  binding: SourceBinding;
}

export function draftFromOutput(output: WorkPlanOutput): OutputDraft {
  return {
    id: output.id,
    description: output.description,
    indicator: output.indicator,
    target: output.target === null ? "" : String(output.target),
    section: output.section,
    note: output.note || "",
    logLabel: output.logLabel || "",
    supporting: !!output.supporting,
    parentId: output.parentId || "",
    binding: output.binding,
  };
}

export function emptyDraft(
  id: string,
  section: Section,
  supporting = false,
): OutputDraft {
  return {
    id,
    description: "",
    indicator: supporting ? "Number" : "Number",
    target: "",
    section,
    note: "",
    logLabel: "",
    supporting,
    parentId: "",
    // A new row is typed until someone says otherwise, and it gets its own
    // metric key so its figures can never land on another row's.
    binding: { kind: "manual", key: outputMetricKey(id) },
  };
}

function parseTarget(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? Math.floor(n) : null;
}

/**
 * What to store: the fields that differ from the approved row, or the whole
 * row when it is being added. An entry that says nothing is `null` — the
 * caller clears the row's config, which is the undo.
 */
export function entryFromDraft(
  draft: OutputDraft,
  base: WorkPlanOutput | null,
): WorkPlanOutputConfig | null {
  const target = parseTarget(draft.target);
  const full: WorkPlanOutputConfig = {
    description: draft.description.trim(),
    indicator: draft.indicator.trim(),
    target,
    section: draft.section,
    note: draft.note.trim(),
    logLabel: draft.logLabel.trim() || undefined,
    supporting: draft.supporting,
    parentId: draft.parentId.trim() || undefined,
    binding: draft.binding,
  };
  if (!base) return { ...full, added: true };

  const entry: WorkPlanOutputConfig = {};
  if (full.description !== base.description) entry.description = full.description;
  if (full.indicator !== base.indicator) entry.indicator = full.indicator;
  if (target !== base.target) entry.target = target;
  if (full.section !== base.section) entry.section = full.section;
  if ((full.note || "") !== (base.note || "")) entry.note = full.note;
  if ((full.logLabel || "") !== (base.logLabel || "")) {
    entry.logLabel = full.logLabel;
  }
  if (!!full.supporting !== !!base.supporting) entry.supporting = full.supporting;
  if ((full.parentId || "") !== (base.parentId || "")) {
    entry.parentId = full.parentId;
  }
  if (!sameBinding(draft.binding, base.binding)) entry.binding = draft.binding;
  if (base.added) return { ...full, added: true };
  return Object.keys(entry).length ? entry : null;
}

// ---------------------------------------------------------------------------
// Where the figure comes from
// ---------------------------------------------------------------------------

const LINK_KINDS: { value: SourceBinding["kind"]; label: string }[] = [
  { value: "manual", label: "Typed here, or logged on Daily Updates" },
  { value: "licences", label: "Counted off the licensing register" },
  { value: "inspections", label: "Counted off the inspection register" },
  { value: "enforcement", label: "Enforcement actions on the inspection register" },
];

function LinkPicker({
  id,
  binding,
  plan,
  onChange,
}: {
  id: string;
  binding: SourceBinding;
  plan: Subprogramme[];
  onChange: (b: SourceBinding) => void;
}) {
  /**
   * Rows a figure can be shared with: every other manual row, by the metric
   * their figures are stored against. Pointing two rows at one key is how the
   * plan reports the same work twice without anybody retyping it — the
   * screened-vehicles row already does exactly this with the border scan log.
   */
  const shareable = useMemo(
    () =>
      planOutputs(plan)
        .filter((o) => o.id !== id && o.binding.kind === "manual")
        .map((o) => ({
          key: (o.binding as { key: string }).key,
          label: `${o.id} — ${o.description}`,
        })),
    [plan, id],
  );

  const ownKey = outputMetricKey(id);
  const manualKey = binding.kind === "manual" ? binding.key : ownKey;
  const shared = binding.kind === "manual" && manualKey !== ownKey;

  const toggle = <T extends string>(list: T[] | undefined, value: T): T[] => {
    const set = new Set(list || []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    return [...set];
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="field-label" htmlFor={`link-${id}`}>
          Where this figure comes from
        </label>
        <select
          id={`link-${id}`}
          className="input"
          value={binding.kind}
          onChange={(e) => {
            const kind = e.target.value as SourceBinding["kind"];
            if (kind === "manual") onChange({ kind: "manual", key: ownKey });
            else if (kind === "licences") onChange({ kind: "licences" });
            else if (kind === "inspections") onChange({ kind: "inspections" });
            else onChange({ kind: "enforcement" });
          }}
        >
          {LINK_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-gunmetal/60 mt-1">
          {describeBinding(binding)}
        </p>
      </div>

      {binding.kind === "licences" ? (
        <TypeChecklist
          legend="Which licences (none ticked counts every licence)"
          options={LICENCE_TYPES}
          selected={binding.types}
          onToggle={(t) =>
            onChange({ kind: "licences", types: toggle(binding.types, t as LicenceType) })
          }
        />
      ) : null}

      {binding.kind === "inspections" ? (
        <TypeChecklist
          legend="Which inspections (none ticked counts every inspection visit)"
          options={INSPECTION_TYPES}
          selected={binding.types}
          onToggle={(t) =>
            onChange({
              kind: "inspections",
              types: toggle(binding.types, t as InspectionType),
            })
          }
        />
      ) : null}

      {binding.kind === "manual" ? (
        <div className="space-y-2">
          <div>
            <label className="field-label" htmlFor={`share-${id}`}>
              Which figure
            </label>
            <select
              id={`share-${id}`}
              className="input"
              value={shared ? manualKey : ""}
              onChange={(e) =>
                onChange({
                  kind: "manual",
                  key: e.target.value || ownKey,
                  splitByBorder: binding.splitByBorder,
                })
              }
            >
              <option value="">Its own — typed on this row</option>
              {shareable.map((s) => (
                <option key={s.key} value={s.key}>
                  The same figure as {s.label}
                </option>
              ))}
            </select>
            {shared ? (
              <p className="text-xs text-gunmetal/60 mt-1">
                This row and the one it points at report the same number — a
                figure logged against either shows on both.
              </p>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!binding.splitByBorder}
              onChange={(e) =>
                onChange({
                  kind: "manual",
                  key: manualKey,
                  alsoCount: binding.alsoCount,
                  splitByBorder: e.target.checked,
                })
              }
            />
            Show the split by border post when the row is expanded
          </label>
        </div>
      ) : null}

      {breakdownForBinding(binding) ? (
        <p className="text-xs text-gunmetal/60">
          Expanding this row will show the detail behind its figure.
        </p>
      ) : null}
    </div>
  );
}

function TypeChecklist({
  legend,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  options: readonly string[];
  selected: readonly string[] | undefined;
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="field-label">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1">
        {options.map((t) => (
          <label key={t} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={!!selected?.includes(t)}
              onChange={() => onToggle(t)}
            />
            {t}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

export function OutputForm({
  plan,
  draft,
  base,
  adding,
  busy,
  onChange,
  onSave,
  onCancel,
  extraActions,
}: {
  plan: Subprogramme[];
  draft: OutputDraft;
  /** The approved row this is a correction of; null when it is being added. */
  base: WorkPlanOutput | null;
  adding?: boolean;
  busy?: boolean;
  onChange: (draft: OutputDraft) => void;
  onSave: (entry: WorkPlanOutputConfig | null) => void;
  onCancel: () => void;
  extraActions?: React.ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<OutputDraft>) => onChange({ ...draft, ...patch });

  const save = () => {
    const entry = entryFromDraft(draft, base);
    const problem = validateOutputEdit(plan, draft.id, entry || {}, {
      added: adding,
    });
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    onSave(entry);
  };

  return (
    <div className="space-y-3 no-print">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="lg:col-span-2">
          <label className="field-label" htmlFor={`desc-${draft.id}`}>
            Output description
          </label>
          <input
            id={`desc-${draft.id}`}
            className="input"
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="What the plan says this output is."
          />
        </div>
        <div>
          <label className="field-label" htmlFor={`ind-${draft.id}`}>
            Key indicator
          </label>
          <input
            id={`ind-${draft.id}`}
            className="input"
            value={draft.indicator}
            onChange={(e) => set({ indicator: e.target.value })}
            placeholder="Number of inspections"
          />
        </div>
        <div>
          <label className="field-label" htmlFor={`target-${draft.id}`}>
            Target for the year
          </label>
          <input
            id={`target-${draft.id}`}
            className="input"
            inputMode="numeric"
            value={draft.target}
            onChange={(e) => set({ target: e.target.value })}
            placeholder="Leave blank for no target"
          />
          <p className="text-xs text-gunmetal/60 mt-1">
            % Achieved is measured against this. Blank reports as “—”, the
            workbook&apos;s own dash.
          </p>
        </div>
        <div>
          <label className="field-label" htmlFor={`section-${draft.id}`}>
            Reported by
          </label>
          <select
            id={`section-${draft.id}`}
            className="input"
            value={draft.section}
            onChange={(e) => set({ section: e.target.value as Section })}
          >
            {SECTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor={`log-${draft.id}`}>
            Short label for Daily Updates
          </label>
          <input
            id={`log-${draft.id}`}
            className="input"
            value={draft.logLabel}
            onChange={(e) => set({ logLabel: e.target.value })}
            placeholder="Optional — what officers tap to log this"
          />
        </div>
        <div className="lg:col-span-2">
          <label className="field-label" htmlFor={`note-${draft.id}`}>
            Note under the description
          </label>
          <input
            id={`note-${draft.id}`}
            className="input"
            value={draft.note}
            onChange={(e) => set({ note: e.target.value })}
            placeholder="Optional — how the figure should be read."
          />
        </div>
      </div>

      <div className="rounded-lg bg-[var(--sunken)] p-3">
        <LinkPicker
          id={draft.id}
          binding={draft.binding}
          plan={plan}
          onChange={(binding) => set({ binding })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.supporting}
            onChange={(e) => set({ supporting: e.target.checked })}
          />
          Supporting figure — tracked by the section, not a plan output
        </label>
        {draft.supporting ? (
          <div className="flex items-center gap-2">
            <label className="text-sm" htmlFor={`parent-${draft.id}`}>
              Detail behind
            </label>
            <select
              id={`parent-${draft.id}`}
              className="input"
              style={{ maxWidth: 260 }}
              value={draft.parentId}
              onChange={(e) => set({ parentId: e.target.value })}
            >
              <option value="">No particular output</option>
              {planOutputs(plan)
                .filter((o) => !o.supporting)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id} — {o.description}
                  </option>
                ))}
            </select>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm" style={{ color: "var(--status-stalled)" }}>
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : adding ? "Add to the plan" : "Save changes"}
        </button>
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        {extraActions}
      </div>
    </div>
  );
}
