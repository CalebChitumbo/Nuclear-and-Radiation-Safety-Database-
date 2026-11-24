"use client";

import { useEffect, useState } from "react";

import { Panel } from "@/components/Section";
import { ServiceProviderBadge } from "@/components/facility/ServiceProviderBadge";
import {
  RECOGNITION_NOTE_MAX,
  isRecognisedProvider,
  recognitionPatch,
  serviceProviderPatch,
} from "@/lib/rules/serviceProviders";
import { todayISO } from "@/lib/rules/week";
import type { Facility } from "@/lib/rules/types";

/**
 * Whether a facility is a service provider and, if it is, whether the
 * Authority has recognised it — shown to everyone who can open the facility,
 * editable by Licensing (`canEdit`, the same people who may edit the record;
 * firestore.rules holds them to it).
 *
 * `onPatch` writes the patch and refreshes the page, and resolves false when
 * the write was refused (it has already said why).
 */
export function ServiceProviderPanel({
  facility,
  canEdit,
  actorName,
  busy,
  onPatch,
  bleed,
}: {
  facility: Facility;
  canEdit: boolean;
  actorName: string;
  busy: boolean;
  onPatch: (patch: Partial<Facility>, note: string) => Promise<boolean>;
  bleed?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [recognised, setRecognised] = useState(!!facility.spRecognised);
  const [on, setOn] = useState(facility.spRecognisedOn || "");
  const [note, setNote] = useState(facility.spRecognitionNote || "");
  const [error, setError] = useState("");

  // A fresh facility (or a fresh copy after a save) resets the form.
  useEffect(() => {
    setRecognised(!!facility.spRecognised);
    setOn(facility.spRecognisedOn || "");
    setNote(facility.spRecognitionNote || "");
    setError("");
  }, [facility]);

  const isSp = !!facility.serviceProvider;
  if (!isSp && !canEdit) return null;

  const toggleProvider = () =>
    onPatch(
      serviceProviderPatch(!isSp, { name: actorName }, new Date().toISOString()),
      isSp ? "No longer marked as a service provider." : "Marked as a service provider.",
    );

  const save = async () => {
    setError("");
    let patch: Partial<Facility>;
    try {
      patch = recognitionPatch(
        facility,
        { recognised, on, note },
        { name: actorName },
        new Date().toISOString(),
        todayISO(),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    const ok = await onPatch(
      patch,
      recognised ? "Recognition recorded." : "Recorded as not yet recognised.",
    );
    if (ok) setEditing(false);
  };

  const by =
    facility.spRecognitionBy && facility.spRecognitionAt
      ? `${facility.spRecognitionBy}, ${facility.spRecognitionAt.slice(0, 10)}`
      : "";

  return (
    <Panel
      title="Service provider"
      bleed={bleed}
      note={
        isSp
          ? undefined
          : "Mark this facility if it provides a service (supply, transport, maintenance, dosimetry …) rather than using radiation in a practice of its own."
      }
    >
      {isSp ? (
        <div className="space-y-2 text-sm">
          <ServiceProviderBadge f={facility} />
          {isRecognisedProvider(facility) ? (
            <dl className="text-xs space-y-1 mt-1">
              <div>
                <dt className="inline text-gunmetal/55">Recognised on: </dt>
                <dd className="inline tabular">{facility.spRecognisedOn || "date not recorded"}</dd>
              </div>
              {facility.spRecognitionNote ? (
                <div>
                  <dt className="inline text-gunmetal/55">Note: </dt>
                  <dd className="inline">{facility.spRecognitionNote}</dd>
                </div>
              ) : null}
            </dl>
          ) : facility.spRecognitionNote ? (
            <p className="text-xs text-gunmetal/65">{facility.spRecognitionNote}</p>
          ) : null}
          {by ? (
            <p className="text-[11px] text-gunmetal/50">Last changed by {by}</p>
          ) : null}
        </div>
      ) : null}

      {canEdit ? (
        editing && isSp ? (
          <div className="mt-3 inset p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={recognised}
                onChange={(e) => setRecognised(e.target.checked)}
              />
              Recognised / verified by the Authority
            </label>
            {recognised ? (
              <div>
                <label className="field-label" htmlFor="sp-on">
                  Recognition date (optional)
                </label>
                <input
                  id="sp-on"
                  type="date"
                  className="input"
                  max={todayISO()}
                  value={on}
                  onChange={(e) => setOn(e.target.value)}
                />
              </div>
            ) : null}
            <div>
              <label className="field-label" htmlFor="sp-note">
                Note (optional)
              </label>
              <textarea
                id="sp-note"
                className="input"
                rows={2}
                maxLength={RECOGNITION_NOTE_MAX}
                value={note}
                placeholder="Letter ref., scope of the recognition, conditions…"
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            {error ? <p className="text-xs text-[var(--status-stalled)]">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={busy} onClick={save}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setEditing(false);
                  setError("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {isSp ? (
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                {isRecognisedProvider(facility) ? "Edit recognition" : "Record recognition"}
              </button>
            ) : null}
            <button
              className={isSp ? "btn btn-ghost" : "btn btn-secondary"}
              disabled={busy}
              onClick={toggleProvider}
            >
              {isSp ? "Not a service provider" : "Mark as service provider"}
            </button>
          </div>
        )
      ) : null}
    </Panel>
  );
}
