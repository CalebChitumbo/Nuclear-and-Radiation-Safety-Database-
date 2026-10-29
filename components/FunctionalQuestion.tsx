"use client";

import { useState } from "react";

import { Panel } from "./Section";
import { useToast } from "./Toast";
import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";

/**
 * "Is it operating?" — asked whenever an authorisation lands on a facility
 * the register does not already count as functional: a facility being created
 * from the licence, or one marked non-functional. An authorisation alone says
 * nothing about it (an import licence is often issued before anything is
 * installed), so the officer answers and nothing is assumed. `undefined` is
 * unanswered; the forms hold their commit until it is answered.
 */
export function FunctionalQuestion({
  value,
  onChange,
  isNew,
  compact = false,
}: {
  value: boolean | undefined;
  onChange: (functional: boolean) => void;
  /** A facility being created, rather than one on the register as non-functional. */
  isNew: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 space-y-1.5 ${
        value === undefined
          ? "border-[#c9c400] bg-[rgba(240,240,0,0.12)]"
          : "border-gunmetal/10"
      }`}
    >
      <div className={compact ? "text-xs font-bold" : "text-sm font-bold"}>
        {isNew
          ? "Is this facility functional (operating)?"
          : "Marked non-functional — is it operating now?"}
      </div>
      <div className="seg" role="group" aria-label="Functional">
        <button
          type="button"
          className="seg-btn"
          aria-pressed={value === true}
          onClick={() => onChange(true)}
        >
          {isNew ? "Functional" : "Mark functional"}
        </button>
        <button
          type="button"
          className="seg-btn"
          aria-pressed={value === false}
          onClick={() => onChange(false)}
        >
          {isNew ? "Not functional" : "Keep non-functional"}
        </button>
      </div>
      {value === undefined ? (
        <div className="text-[11px] text-gunmetal/60">
          An authorisation on its own does not make a facility functional.
        </div>
      ) : null}
    </div>
  );
}

/**
 * The same question asked after the fact, for saves that record authorisations
 * on their own (accepting RAIS emails on Licence Status): each non-functional
 * facility the save just gave an authorisation to, until the officer answers.
 * Keeping it non-functional writes nothing; marking it functional is the same
 * edit as the facility record's button.
 */
export function FunctionalFollowUp({
  items,
  onAnswered,
}: {
  items: Array<{ id: string; name: string }>;
  /** The facility is answered (and, if marked, written); drop it from the list. */
  onAnswered: (id: string, markedFunctional: boolean) => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!items.length) return null;

  const markFunctional = async (id: string, name: string) => {
    if (!user || busyId) return;
    setBusyId(id);
    try {
      const s = await store();
      await s.updateFacility(id, { functional: true }, user.uid);
      toast.push(`${name} marked functional.`, "success");
      onAnswered(id, true);
    } catch (err) {
      toast.push(
        `Could not mark it functional: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Panel
      title="Functional? — just given an authorisation"
      note="These facilities are marked non-functional. The authorisation was recorded and the flag left as it was — say whether each is operating now."
    >
      <ul className="divide-y divide-gunmetal/8">
        {items.map((f) => (
          <li
            key={f.id}
            className="py-2 flex flex-wrap items-center justify-between gap-2"
          >
            <span className="font-bold break-words min-w-0">{f.name}</span>
            <div className="seg" role="group" aria-label={`Functional — ${f.name}`}>
              <button
                type="button"
                className="seg-btn"
                disabled={busyId !== null}
                onClick={() => markFunctional(f.id, f.name)}
              >
                {busyId === f.id ? "Saving…" : "Mark functional"}
              </button>
              <button
                type="button"
                className="seg-btn"
                disabled={busyId !== null}
                onClick={() => onAnswered(f.id, false)}
              >
                Keep non-functional
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
