"use client";

import { useEffect, useMemo, useState } from "react";

import { Drawer } from "@/components/Drawer";
import {
  diffPatch,
  validateEdit,
  type InventoryEdit,
  type InventoryEditInput,
  type InventoryKind,
} from "@/lib/rules/inventoryEdits";

/**
 * The correction form for both source inventories.
 *
 * The two registers hold different fields, so the caller supplies the field
 * list; everything else — the diff against the seed, the "register says …"
 * annotations, removing, restoring and reverting — is the same on both tabs and
 * lives here once.
 *
 * The form only ever stores what an officer actually changed: on save it diffs
 * the typed values against the seed record, so a field left alone contributes
 * nothing to the overlay and keeps tracking the register if a later import
 * changes it.
 */

export interface EditField {
  name: string;
  label: string;
  /** A select when `options` is given, otherwise a plain or date input. */
  type?: "text" | "date";
  options?: readonly string[];
  placeholder?: string;
  hint?: string;
  /** Show only when the current form values make the field meaningful. */
  when?: (values: Record<string, string>) => boolean;
}

export interface InventoryEditDrawerProps {
  open: boolean;
  onClose: () => void;
  inventory: InventoryKind;
  fields: readonly EditField[];
  /** The record as currently shown (seed + any correction). Null when adding. */
  record: object | null;
  /** The untouched seed record, for the "register says …" notes. Null when added. */
  baseline: object | null;
  /** The stored correction for this record, if it has one. */
  edit: InventoryEdit | null;
  /** The record's key. Null when adding — the officer types it. */
  recordKey: string | null;
  /** How the identity field is labelled and validated when adding. */
  keyField: { label: string; placeholder: string; hint?: string };
  /** Keys already in use, so an addition cannot collide. */
  takenKeys: ReadonlySet<string>;
  onSave: (input: InventoryEditInput) => Promise<void>;
  onRevert: () => Promise<void>;
}

export function InventoryEditDrawer({
  open,
  onClose,
  inventory,
  fields,
  record,
  baseline,
  edit,
  recordKey,
  keyField,
  takenKeys,
  onSave,
  onRevert,
}: InventoryEditDrawerProps) {
  const adding = recordKey === null;
  const [values, setValues] = useState<Record<string, string>>({});
  const [key, setKey] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Re-seed the form each time the drawer opens on a different record, so it
  // never shows the previous record's values for a moment.
  useEffect(() => {
    if (!open) return;
    const from = (record ?? {}) as Record<string, unknown>;
    const next: Record<string, string> = {};
    for (const f of fields) next[f.name] = String(from[f.name] ?? "");
    setValues(next);
    setKey(recordKey ?? "");
    setNote(edit?.note ?? "");
    setProblem(null);
  }, [open, record, recordKey, edit, fields]);

  const visible = useMemo(
    () => fields.filter((f) => !f.when || f.when(values)),
    [fields, values],
  );

  const set = (name: string, value: string) =>
    setValues((v) => ({ ...v, [name]: value }));

  const patch = useMemo(
    // An addition has no baseline, so every typed value is part of the record.
    () => diffPatch(inventory, adding ? null : baseline, values),
    [inventory, adding, baseline, values],
  );
  const changedCount = Object.keys(patch).length;

  const submit = async () => {
    const input: InventoryEditInput = {
      inventory,
      key: adding ? key.trim() : (recordKey as string),
      patch,
      added: adding || undefined,
      removed: edit?.removed || undefined,
      note: note.trim() || undefined,
    };
    const failed = validateEdit(input, takenKeys);
    if (failed) {
      setProblem(failed);
      return;
    }
    setBusy(true);
    try {
      await onSave(input);
      onClose();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not save the change.");
    } finally {
      setBusy(false);
    }
  };

  const act = async (run: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await run();
      onClose();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not save the change.");
    } finally {
      setBusy(false);
    }
  };

  const toggleRemoved = () =>
    act(() =>
      onSave({
        inventory,
        key: adding ? key.trim() : (recordKey as string),
        patch: edit?.patch ?? {},
        added: edit?.added || undefined,
        removed: !edit?.removed || undefined,
        note: note.trim() || undefined,
      }),
    );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={adding ? "Add a record" : recordKey || "Edit record"}
      subtitle={
        adding
          ? "Recorded here, not imported — it will carry an Added mark."
          : edit?.removed
            ? "Removed from the register — restore it to bring it back."
            : "Corrections are stored against this record, not written over the register."
      }
      footer={
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-primary flex-1 sm:flex-none"
            onClick={submit}
            disabled={busy || (!adding && changedCount === 0 && note === (edit?.note ?? ""))}
          >
            {busy
              ? "Saving…"
              : adding
                ? "Add record"
                : `Save${changedCount ? ` (${changedCount})` : ""}`}
          </button>
          {!adding ? (
            <button
              className="btn btn-secondary"
              onClick={toggleRemoved}
              disabled={busy}
            >
              {edit?.removed ? "Restore" : "Remove"}
            </button>
          ) : null}
          {!adding && edit ? (
            <button
              className="btn btn-ghost"
              onClick={() => act(onRevert)}
              disabled={busy}
              title={
                edit.added
                  ? "Delete this added record for good"
                  : "Discard the correction and show what the register says"
              }
            >
              {edit.added ? "Delete" : "Revert"}
            </button>
          ) : null}
        </div>
      }
    >
      {problem ? (
        <div
          role="alert"
          className="card p-3 text-sm"
          style={{ borderLeft: "3px solid var(--status-stalled)" }}
        >
          {problem}
        </div>
      ) : null}

      {adding ? (
        <div>
          <label className="field-label" htmlFor="inv-key">
            {keyField.label}
          </label>
          <input
            id="inv-key"
            className="input"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={keyField.placeholder}
          />
          {keyField.hint ? (
            <p className="text-[11px] text-gunmetal/55 mt-1">{keyField.hint}</p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3">
        {visible.map((f) => {
          const was = baseline
            ? String((baseline as Record<string, unknown>)[f.name] ?? "")
            : "";
          const changed = patch[f.name] !== undefined;
          return (
            <div key={f.name}>
              <label className="field-label" htmlFor={`inv-${f.name}`}>
                {f.label}
              </label>
              {f.options ? (
                <select
                  id={`inv-${f.name}`}
                  className="input"
                  value={values[f.name] ?? ""}
                  onChange={(e) => set(f.name, e.target.value)}
                >
                  <option value="">— not recorded —</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`inv-${f.name}`}
                  className="input"
                  type={f.type === "date" ? "date" : "text"}
                  value={values[f.name] ?? ""}
                  onChange={(e) => set(f.name, e.target.value)}
                  placeholder={f.placeholder}
                />
              )}
              {/* What the imported register says, whenever it differs from
                  what is in the box — the correction never hides the source. */}
              {changed && !adding ? (
                <p className="text-[11px] text-gunmetal/55 mt-1">
                  Register says:{" "}
                  {was ? (
                    <span className="tabular">{was}</span>
                  ) : (
                    <span className="italic">nothing recorded</span>
                  )}
                </p>
              ) : f.hint ? (
                <p className="text-[11px] text-gunmetal/55 mt-1">{f.hint}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div>
        <label className="field-label" htmlFor="inv-note">
          Note <span className="text-gunmetal/45">(optional)</span>
        </label>
        <input
          id="inv-note"
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="why the record was corrected"
          maxLength={500}
        />
      </div>

      {edit ? (
        <p className="text-[11px] text-gunmetal/50">
          Last changed by {edit.updatedByName || edit.updatedBy} on{" "}
          {edit.updatedAt.slice(0, 10)}.
        </p>
      ) : null}
    </Drawer>
  );
}
