"use client";

import { useEffect, useMemo, useState } from "react";

import { Panel } from "@/components/Section";
import { Segmented } from "@/components/Segmented";
import { CardStatusChip, EnforcementChip } from "@/components/inspectorate/InspectionDatabaseTable";
import { store } from "@/lib/store";
import {
  buildInspectionCard,
  countCardStatuses,
  inspectionCardProblem,
  type CardRecord,
} from "@/lib/rules/inspectionCards";
import { cardExpiry, describeCard, CARD_VALID_DAYS } from "@/lib/rules/inspectionDatabase";
import { norm } from "@/lib/rules/matching";
import { todayISO } from "@/lib/rules/week";
import type { Facility, InspectionCard } from "@/lib/rules/types";

type StatusFilter = "all" | "Active" | "Expiring Soon" | "Expired";

/**
 * The inspection card register: every card issued in the period, whichever
 * way it reached the system — stamped on a logged inspection, or recorded on
 * its own for a visit made before the log carried cards. The section's
 * question is "which are still running and which have run out", so the
 * filter is the card's standing, and the standing is the date's, derived.
 */
export function InspectionCardRegisterPanel({
  register,
  today,
  canEdit,
  onEdit,
  onRemove,
}: {
  register: CardRecord[];
  today: string;
  canEdit: boolean;
  /** Open a recorded card in the form. */
  onEdit: (id: string) => void;
  /** Take a recorded card off the register. */
  onRemove: (id: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const counts = useMemo(() => countCardStatuses(register), [register]);
  const shown = useMemo(
    () => (filter === "all" ? register : register.filter((r) => r.status === filter)),
    [register, filter],
  );
  const recorded = register.filter((r) => r.source === "record").length;

  return (
    <Panel
      title={`Inspection card register — ${register.length}`}
      flush
      note={`${counts.Active} running · ${counts["Expiring Soon"]} inside the last fortnight · ${counts.Expired} expired. ${
        recorded
          ? `${recorded} recorded for the record; the rest were issued at inspections logged here.`
          : "Every card here was issued at an inspection logged in the app."
      }`}
    >
      <div className="px-4 sm:px-5 pb-3">
        <Segmented
          ariaLabel="Card standing"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all" as StatusFilter, label: `All (${register.length})` },
            { value: "Active" as StatusFilter, label: `Running (${counts.Active})` },
            {
              value: "Expiring Soon" as StatusFilter,
              label: `Expiring soon (${counts["Expiring Soon"]})`,
            },
            { value: "Expired" as StatusFilter, label: `Expired (${counts.Expired})` },
          ]}
        />
      </div>
      {shown.length === 0 ? (
        <p className="px-4 sm:px-5 text-sm text-gunmetal/60">
          {register.length === 0
            ? "No inspection card in this period. Cards issued at logged inspections appear here as they are logged; past cards can be put on the register with the form below."
            : "No card with that standing in this period."}
        </p>
      ) : (
        <ul className="divide-y divide-gunmetal/8">
          {shown.map((r) => (
            <li
              key={r.key}
              className="px-4 sm:px-5 py-3 flex flex-wrap items-start justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="font-bold break-words">{r.facility}</div>
                <div className="text-[11px] text-gunmetal/55">
                  {r.province || "Unassigned"}
                  {r.district ? ` · ${r.district}` : ""}
                  {r.reference ? ` · card ${r.reference}` : ""}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="chip slate">
                    {r.source === "record" ? "Recorded card" : "Issued at logged inspection"}
                  </span>
                  {r.enforcement ? <EnforcementChip action={r.enforcement} /> : null}
                </div>
                {r.findings ? (
                  <div className="text-xs text-gunmetal/65 mt-1 whitespace-pre-line">
                    {r.findings}
                  </div>
                ) : null}
              </div>
              <div className="text-right shrink-0">
                <CardStatusChip status={r.status} />
                <div className="text-[11px] text-gunmetal/55 tabular mt-1">
                  {r.issued} → {r.expiry}
                </div>
                <div
                  className={`text-[11px] font-bold tabular ${
                    r.status === "Expired"
                      ? "text-[var(--status-stalled)]"
                      : r.status === "Expiring Soon"
                        ? "text-[#7a5b07]"
                        : "text-gunmetal/60"
                  }`}
                >
                  {describeCard(r.expiry, today)}
                </div>
                {canEdit && r.source === "record" ? (
                  confirmRemove === r.id ? (
                    <div className="mt-1 flex flex-wrap justify-end gap-2 text-[11px]">
                      <button
                        className="link-action"
                        style={{ color: "var(--status-stalled)" }}
                        onClick={async () => {
                          await onRemove(r.id);
                          setConfirmRemove(null);
                        }}
                      >
                        Remove it
                      </button>
                      <button className="link-action" onClick={() => setConfirmRemove(null)}>
                        Keep it
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 flex flex-wrap justify-end gap-2 text-[11px]">
                      <button className="link-action" onClick={() => onEdit(r.id)}>
                        Edit
                      </button>
                      <button
                        className="link-action"
                        style={{ color: "var(--status-stalled)" }}
                        onClick={() => setConfirmRemove(r.id)}
                      >
                        Remove
                      </button>
                    </div>
                  )
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * Record an inspection card on its own — for the cards the section issued
 * before the log carried them, or at a visit that was never logged here. It
 * creates no inspection: nothing is counted, the province sheet does not
 * move. The card's standing (running / expiring / expired) follows from the
 * day it was issued, as it does for every card.
 *
 * `editing` opens an existing recorded card in the same form; saving then
 * corrects it in place.
 */
export function RecordInspectionCardPanel({
  facilities,
  editing,
  actorUid,
  onSaved,
  onCancelEdit,
  toastPush,
}: {
  facilities: Facility[];
  editing: InspectionCard | null;
  actorUid: string;
  onSaved: () => void;
  onCancelEdit: () => void;
  toastPush: (msg: string, kind?: "success" | "error") => void;
}) {
  const today = todayISO();
  const [facilityQuery, setFacilityQuery] = useState("");
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [facilityNameFreeText, setFacilityNameFreeText] = useState("");
  const [district, setDistrict] = useState("");
  const [issued, setIssued] = useState("");
  const [reference, setReference] = useState("");
  const [nonCompliances, setNonCompliances] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const suggestions = useMemo(() => {
    if (!facilityQuery.trim()) return [];
    const q = norm(facilityQuery);
    return facilities.filter((f) => f.nameLower.includes(q)).slice(0, 8);
  }, [facilities, facilityQuery]);

  const selected: Facility | null = facilityId
    ? facilities.find((f) => f.id === facilityId) || null
    : null;

  const clear = () => {
    setFacilityQuery("");
    setFacilityId(null);
    setFacilityNameFreeText("");
    setDistrict("");
    setIssued("");
    setReference("");
    setNonCompliances("");
    setNotes("");
  };

  // Opening a recorded card for correction fills the form with it and brings
  // the form into view.
  useEffect(() => {
    if (!editing) {
      clear();
      return;
    }
    setFacilityId(editing.facilityId);
    setFacilityQuery(editing.facilityName);
    setFacilityNameFreeText(editing.facilityId ? "" : editing.facilityName);
    setDistrict(editing.district || "");
    setIssued(editing.issued);
    setReference(editing.reference || "");
    setNonCompliances(editing.nonCompliances || "");
    setNotes(editing.notes || "");
    document
      .getElementById("record-card")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editing]);

  const input = {
    issued,
    facilityId: selected ? selected.id : null,
    facilityName: selected ? selected.name : facilityNameFreeText,
    district,
    reference,
    nonCompliances,
    notes,
  };
  const problem = inspectionCardProblem(input, today);

  const submit = async () => {
    if (problem) {
      toastPush(problem, "error");
      return;
    }
    setBusy(true);
    try {
      const s = await store();
      const record = buildInspectionCard(input, facilities);
      if (editing) {
        await s.updateInspectionCard(editing.id, record, actorUid);
        toastPush(`Card for ${record.facilityName} corrected.`, "success");
      } else {
        await s.addInspectionCard(record, actorUid);
        toastPush(`Card for ${record.facilityName} put on the register.`, "success");
      }
      clear();
      onSaved();
    } catch (err) {
      toastPush(
        `Saving the card failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <span id="record-card" className="block scroll-mt-4" aria-hidden />
      <Panel
        title={editing ? `Correct the card for ${editing.facilityName}` : "Record a past inspection card"}
        note={`For a card issued before the log carried them, or at a visit not logged here. It creates no inspection — nothing is counted — and its standing follows from the day it was issued: a card runs ${CARD_VALID_DAYS} days.`}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="card-facility">
              Facility
            </label>
            <div className="relative">
              <input
                id="card-facility"
                className="input"
                placeholder="Search register…"
                value={selected ? selected.name : facilityQuery}
                onChange={(e) => {
                  setFacilityQuery(e.target.value);
                  setFacilityId(null);
                  setFacilityNameFreeText(e.target.value);
                }}
              />
              {suggestions.length > 0 && !selected ? (
                <ul className="popover absolute left-0 right-0 mt-1 z-20 max-h-60 overflow-y-auto">
                  {suggestions.map((f) => (
                    <li
                      key={f.id}
                      onClick={() => {
                        setFacilityId(f.id);
                        setFacilityQuery(f.name);
                      }}
                      className="px-3 py-2.5 text-sm hover:bg-mist cursor-pointer"
                    >
                      <div className="font-bold">{f.name}</div>
                      <div className="text-xs text-gunmetal/60">
                        {f.facCode || "—"} · {f.district || "—"} · {f.province}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <p className="text-[11px] text-gunmetal/55 mt-1">
              {selected
                ? `${selected.district || "—"} · ${selected.practice || "—"} · ${selected.province}`
                : "Free-text is fine if the facility isn’t in the register yet."}
            </p>
          </div>
          <div>
            <label className="field-label" htmlFor="card-issued">
              Date issued
            </label>
            <input
              id="card-issued"
              type="date"
              className="input"
              value={issued}
              max={today}
              onChange={(e) => setIssued(e.target.value)}
            />
            <p className="text-[11px] text-gunmetal/55 mt-1 tabular">
              {issued
                ? `Valid to ${cardExpiry(issued)} — ${describeCard(cardExpiry(issued), today).toLowerCase()}`
                : "The card's 30 days run from this day."}
            </p>
          </div>

          {!selected ? (
            <div>
              <label className="field-label" htmlFor="card-district">
                District
              </label>
              <input
                id="card-district"
                className="input"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="e.g. Kitwe"
              />
            </div>
          ) : null}
          <div>
            <label className="field-label" htmlFor="card-reference">
              Card number <span className="text-gunmetal/45">(optional)</span>
            </label>
            <input
              id="card-reference"
              className="input"
              value={reference}
              maxLength={80}
              onChange={(e) => setReference(e.target.value)}
              placeholder="As written on the card"
            />
          </div>
          <div className="md:col-span-2">
            <label className="field-label" htmlFor="card-noncompliances">
              Non-compliances
            </label>
            <textarea
              id="card-noncompliances"
              className="input"
              rows={3}
              value={nonCompliances}
              onChange={(e) => setNonCompliances(e.target.value)}
              placeholder="The non-compliances the card was issued against, as written on it"
            />
          </div>
          <div className="md:col-span-2">
            <label className="field-label" htmlFor="card-notes">
              Notes <span className="text-gunmetal/45">(optional)</span>
            </label>
            <textarea
              id="card-notes"
              className="input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Who issued it, what has happened since, etc."
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={busy}
            className="btn btn-primary w-full sm:w-auto"
            onClick={submit}
          >
            {busy ? "Saving…" : editing ? "Save the correction" : "Put the card on the register"}
          </button>
          {editing ? (
            <button className="btn btn-ghost" disabled={busy} onClick={onCancelEdit}>
              Cancel
            </button>
          ) : null}
        </div>
      </Panel>
    </>
  );
}
