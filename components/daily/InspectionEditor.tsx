"use client";

/**
 * Correcting an inspection that has already been logged.
 *
 * The Inspectorate's quick-log is four taps — facility, type, outcome,
 * enforcement — which is what makes it usable at a facility, and also what
 * makes a wrong tap easy. The inspection is counted the moment it lands (work
 * plan outputs 1.2.4 and 1.2.11 both read the register), so leaving a mistake
 * in place moves the section's reported figures.
 *
 * Everything except the facility is editable here: type, outcome, enforcement
 * action, the day, and whether (and when) an inspection card was issued — the
 * card's 30-day timer is derived from that date, so correcting it here moves
 * the card on the Inspectorate tab's due list. The facility is not, because an
 * inspection filed against the wrong facility carries that facility's
 * province, district and practice with it — that one is removed and logged
 * again. Removing is an administrator's, since it takes a counted inspection
 * back out of the year.
 */
import { useState } from "react";

import { store } from "@/lib/store";
import { useToast } from "@/components/Toast";
import { ENFORCEMENT_ACTIONS, cardExpiry } from "@/lib/rules/inspectionDatabase";
import { weekLabelForDate } from "@/lib/rules/week";
import {
  INSPECTION_OUTCOMES,
  INSPECTION_TYPES,
  type Inspection,
  type InspectionOutcome,
  type InspectionType,
  type WeekDef,
} from "@/lib/rules/types";

export function InspectionEditor({
  inspection,
  weeks,
  canRemove,
  actorUid,
  onSaved,
  onCancel,
}: {
  inspection: Inspection;
  weeks: WeekDef[];
  /** Administrators only — see the module note. */
  canRemove: boolean;
  actorUid: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(inspection.date);
  const [type, setType] = useState<InspectionType>(inspection.type);
  const [outcome, setOutcome] = useState<InspectionOutcome>(inspection.outcome);
  const [enforcement, setEnforcement] = useState(inspection.enforcement || "");
  const [notes, setNotes] = useState(inspection.notes || "");
  const [cardIssued, setCardIssued] = useState(!!inspection.cardIssued);
  const [cardDate, setCardDate] = useState(inspection.cardIssued || inspection.date);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const week = weekLabelForDate(date, weeks, "");

  const save = async () => {
    if (busy) return;
    if (!date || !week) {
      toast.push(
        `${date || "That day"} is outside the reporting calendar — pick a day inside it.`,
        "error",
      );
      return;
    }
    setBusy(true);
    try {
      const s = await store();
      await s.updateInspection(
        inspection.id,
        {
          date,
          type,
          outcome,
          enforcement: enforcement || undefined,
          notes,
          cardIssued: cardIssued ? cardDate || date : undefined,
        },
        actorUid,
      );
      toast.push("Inspection corrected.", "success");
      onSaved();
    } catch (err) {
      toast.push(
        `Saving the correction failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const s = await store();
      await s.deleteInspection(inspection.id);
      toast.push("Inspection removed from the register.", "success");
      onSaved();
    } catch (err) {
      toast.push(
        `Removing failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-gunmetal/8 pt-3 mt-3">
      <div className="caps text-[10px] text-gunmetal/55">
        Correcting {inspection.facilityName}
      </div>

      <div className="flex flex-wrap gap-3">
        <div>
          <label className="field-label" htmlFor={`insp-date-${inspection.id}`}>
            Day
          </label>
          <input
            id={`insp-date-${inspection.id}`}
            type="date"
            className="input"
            style={{ maxWidth: 170 }}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <div className="text-[11px] text-gunmetal/50 mt-0.5">
            {week || "outside the calendar"}
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor={`insp-type-${inspection.id}`}>
            Type
          </label>
          <select
            id={`insp-type-${inspection.id}`}
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value as InspectionType)}
          >
            {INSPECTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            className="field-label"
            htmlFor={`insp-outcome-${inspection.id}`}
          >
            Outcome
          </label>
          <select
            id={`insp-outcome-${inspection.id}`}
            className="input"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as InspectionOutcome)}
          >
            {INSPECTION_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div className="grow" style={{ minWidth: "14rem" }}>
          <label
            className="field-label"
            htmlFor={`insp-enforcement-${inspection.id}`}
          >
            Enforcement action
          </label>
          <select
            id={`insp-enforcement-${inspection.id}`}
            className="input"
            value={enforcement}
            onChange={(e) => setEnforcement(e.target.value)}
          >
            <option value="">None</option>
            {ENFORCEMENT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={cardIssued}
            onChange={(e) => {
              setCardIssued(e.target.checked);
              if (e.target.checked && !cardDate) setCardDate(date);
            }}
          />
          <span>Inspection card issued</span>
        </label>
        {cardIssued ? (
          <div>
            <label className="field-label" htmlFor={`insp-card-${inspection.id}`}>
              Card issued on
            </label>
            <input
              id={`insp-card-${inspection.id}`}
              type="date"
              className="input"
              style={{ maxWidth: 170 }}
              value={cardDate}
              onChange={(e) => setCardDate(e.target.value)}
            />
            <div className="text-[11px] text-gunmetal/50 mt-0.5 tabular">
              valid to {cardExpiry(cardDate || date) || "—"} (30 days)
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <label className="field-label" htmlFor={`insp-notes-${inspection.id}`}>
          Notes (optional)
        </label>
        <textarea
          id={`insp-notes-${inspection.id}`}
          className="input"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <p className="text-xs text-gunmetal/55">
        Logged against the wrong facility? Remove it and log it again — the
        province, district and practice on the record are that facility&apos;s.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-primary"
          disabled={busy || !week}
          onClick={save}
        >
          {busy ? "Saving…" : "Save the correction"}
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        {canRemove ? (
          confirmRemove ? (
            <>
              <button
                className="btn btn-ghost"
                style={{ color: "var(--status-stalled)" }}
                disabled={busy}
                onClick={remove}
              >
                Remove it from the register
              </button>
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => setConfirmRemove(false)}
              >
                Keep it
              </button>
            </>
          ) : (
            <button
              className="link-action ml-auto"
              style={{ color: "var(--status-stalled)" }}
              disabled={busy}
              onClick={() => setConfirmRemove(true)}
            >
              Remove
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
