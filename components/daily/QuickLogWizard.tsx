"use client";

/**
 * One-question-at-a-time logging for the Daily Updates tab, built for a phone
 * in the field: big tap targets, the numeric keypad for numbers, no dropdowns,
 * and a clear "done ✓" at the end of every path.
 *
 * - Inspectorate: which facility → what type → outcome → enforcement action →
 *   confirm. The entry goes straight into the inspection database (its province
 *   summary, its card list) and the weekly report.
 * - Licensing / NSSS / NSI: what are you logging → (which border post, for
 *   NSSS vehicle screening) → how many. Counts land on the weekly report's
 *   metric keys; free-text notes are one tap away.
 */
import { useMemo, useState } from "react";

import { store } from "@/lib/store";
import { useToast } from "@/components/Toast";
import { dailyMetricOptions, vehicleScreeningKey } from "@/lib/rules/daily";
import {
  cardExpiry,
  ENFORCEMENT_ACTIONS,
  type EnforcementAction,
} from "@/lib/rules/inspectionDatabase";
import { norm } from "@/lib/rules/matching";
import type { Subprogramme } from "@/lib/rules/workPlan";
import {
  INSPECTION_OUTCOMES,
  INSPECTION_TYPES,
  type Border,
  type Facility,
  type InspectionOutcome,
  type InspectionType,
  type Section,
} from "@/lib/rules/types";

export interface QuickLogUser {
  uid: string;
  name: string;
  /**
   * The inland office this officer is posted to, from their account. When set,
   * a screening figure is filed against it without being asked — the wizard
   * drops the "which border post?" step, because for them there is only one
   * answer and the security rules will not accept another.
   */
  postedOffice?: string | null;
}

export function QuickLogWizard({
  section,
  date,
  weekLabel,
  user,
  facilities,
  borders,
  canManageBorders,
  plan,
  onLogged,
}: {
  section: Section;
  date: string;
  weekLabel: string;
  user: QuickLogUser;
  facilities: Facility[];
  borders: Border[];
  canManageBorders: boolean;
  /** The plan in force, so an edited or added row is loggable the same day. */
  plan?: Subprogramme[];
  onLogged: () => void;
}) {
  if (section === "Inspectorate") {
    return (
      <InspectionFlow
        date={date}
        weekLabel={weekLabel}
        facilities={facilities}
        onLogged={onLogged}
      />
    );
  }
  return (
    <CountFlow
      key={section}
      section={section}
      date={date}
      weekLabel={weekLabel}
      user={user}
      borders={borders}
      canManageBorders={canManageBorders}
      plan={plan}
      onLogged={onLogged}
    />
  );
}

// ---------------------------------------------------------------------------
// Shared shell pieces
// ---------------------------------------------------------------------------

function StepShell({
  title,
  sub,
  step,
  steps,
  onBack,
  children,
}: {
  title: string;
  sub?: string;
  step: number;
  steps: number;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        {onBack ? (
          <button
            onClick={onBack}
            className="btn btn-ghost px-2 py-1 text-sm"
            aria-label="Back"
          >
            ‹ Back
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${steps}`}>
          {Array.from({ length: steps }, (_, i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full"
              style={{
                background:
                  i <= step ? "var(--rpa-green)" : "rgba(26,27,29,0.15)",
              }}
            />
          ))}
        </div>
      </div>
      <div className="text-xl sm:text-2xl font-black leading-tight">{title}</div>
      {sub ? <div className="text-sm text-gunmetal/60 mt-1">{sub}</div> : null}
      <div className="mt-4 space-y-2">{children}</div>
    </div>
  );
}

function BigOption({
  label,
  sub,
  onClick,
  muted,
}: {
  label: string;
  sub?: string;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-4 rounded-xl transition-transform active:scale-[0.99]"
      style={{
        background: muted ? "transparent" : "var(--sunken)",
        border: muted ? "1px solid var(--line)" : "1px solid transparent",
      }}
    >
      <span className="block text-base font-bold">{label}</span>
      {sub ? (
        <span className="block text-xs text-gunmetal/60 mt-0.5">{sub}</span>
      ) : null}
    </button>
  );
}

function BigSubmit({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="btn btn-primary w-full text-base"
      style={{ padding: "0.9rem 1rem", borderRadius: 12 }}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function SuccessScreen({
  message,
  sub,
  onAgain,
}: {
  message: string;
  sub: string;
  onAgain: () => void;
}) {
  return (
    <div className="card p-6 sm:p-8 text-center">
      <div
        className="mx-auto w-16 h-16 rounded-full flex items-center justify-center text-3xl text-white"
        style={{ background: "var(--rpa-green)" }}
        aria-hidden="true"
      >
        ✓
      </div>
      <div className="mt-4 text-xl font-black">{message}</div>
      <div className="mt-1 text-sm text-gunmetal/60">{sub}</div>
      <div className="mt-5">
        <BigSubmit onClick={onAgain}>Log another</BigSubmit>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspectorate: facility → type → outcome → confirm → done
// ---------------------------------------------------------------------------

function InspectionFlow({
  date,
  weekLabel,
  facilities,
  onLogged,
}: {
  date: string;
  weekLabel: string;
  facilities: Facility[];
  onLogged: () => void;
}) {
  const toast = useToast();
  type Step = "facility" | "type" | "outcome" | "enforcement" | "confirm" | "done";
  const [step, setStep] = useState<Step>("facility");
  const [query, setQuery] = useState("");
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [freeText, setFreeText] = useState("");
  const [type, setType] = useState<InspectionType | null>(null);
  const [outcome, setOutcome] = useState<InspectionOutcome | null>(null);
  const [enforcement, setEnforcement] = useState<EnforcementAction | "">("");
  const [cardIssued, setCardIssued] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = facilityId
    ? facilities.find((f) => f.id === facilityId) || null
    : null;
  const facilityName = selected ? selected.name : freeText;

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = norm(query);
    return facilities.filter((f) => f.nameLower.includes(q)).slice(0, 6);
  }, [facilities, query]);

  const reset = () => {
    setStep("facility");
    setQuery("");
    setFacilityId(null);
    setFreeText("");
    setType(null);
    setOutcome(null);
    setEnforcement("");
    setCardIssued(false);
    setNotes("");
  };

  const submit = async () => {
    if (!facilityName.trim() || !type || !outcome || busy) return;
    setBusy(true);
    try {
      const s = await store();
      await s.addInspection({
        date,
        week: weekLabel,
        facilityId: selected ? selected.id : null,
        facilityName: facilityName.trim(),
        type,
        outcome,
        notes: notes.trim(),
        province: selected ? selected.province : "",
        sector: selected ? selected.sector : "",
        // The database's district and practice columns, carried in from the
        // register so nobody types what the system already knows.
        district: selected ? selected.district : "",
        practice: selected ? selected.practice : "",
        ...(enforcement ? { enforcement } : {}),
        ...(cardIssued ? { cardIssued: date } : {}),
      });
      setStep("done");
      onLogged();
    } catch (err) {
      toast.push(
        `Saving failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  if (step === "done") {
    return (
      <SuccessScreen
        message={`Inspection logged — ${facilityName}`}
        sub="It's in the register, today's log and this week's report."
        onAgain={reset}
      />
    );
  }

  if (step === "facility") {
    return (
      <StepShell
        title="Which facility did you inspect?"
        sub="Search the register, or just type the name."
        step={0}
        steps={4}
      >
        <input
          className="input text-base"
          style={{ padding: "0.8rem 0.9rem" }}
          placeholder="Start typing the facility…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setFacilityId(null);
            setFreeText(e.target.value);
          }}
        />
        {suggestions.map((f) => (
          <BigOption
            key={f.id}
            label={f.name}
            sub={`${f.facCode || "—"} · ${f.district || "—"} · ${f.province}`}
            onClick={() => {
              setFacilityId(f.id);
              setQuery(f.name);
              setStep("type");
            }}
          />
        ))}
        {query.trim() && suggestions.length === 0 ? (
          <div className="text-sm text-gunmetal/60 px-1">
            Not in the register — that&apos;s fine, use the name as typed.
          </div>
        ) : null}
        {query.trim() ? (
          <BigSubmit
            onClick={() => {
              setFacilityId(null);
              setFreeText(query);
              setStep("type");
            }}
          >
            {suggestions.length > 0
              ? `Use “${query.trim()}” as typed`
              : `Continue with “${query.trim()}”`}
          </BigSubmit>
        ) : null}
      </StepShell>
    );
  }

  if (step === "type") {
    return (
      <StepShell
        title="What type of inspection?"
        sub={facilityName}
        step={1}
        steps={5}
        onBack={() => setStep("facility")}
      >
        {INSPECTION_TYPES.map((t) => (
          <BigOption
            key={t}
            label={t}
            onClick={() => {
              setType(t);
              setStep("outcome");
            }}
          />
        ))}
      </StepShell>
    );
  }

  if (step === "outcome") {
    return (
      <StepShell
        title="What was the outcome?"
        sub={`${facilityName} · ${type}`}
        step={2}
        steps={5}
        onBack={() => setStep("type")}
      >
        {INSPECTION_OUTCOMES.map((o) => (
          <BigOption
            key={o}
            label={o}
            onClick={() => {
              setOutcome(o);
              setStep("enforcement");
            }}
          />
        ))}
      </StepShell>
    );
  }

  // The database's ENFORCEMENT ACTION TAKEN column. "None" comes first because
  // it is the answer for most inspections — one tap and the flow moves on.
  if (step === "enforcement") {
    return (
      <StepShell
        title="Any enforcement action?"
        sub={`${facilityName} · ${outcome}`}
        step={3}
        steps={5}
        onBack={() => setStep("outcome")}
      >
        <BigOption
          label="None"
          sub="No action taken at this inspection"
          onClick={() => {
            setEnforcement("");
            setStep("confirm");
          }}
        />
        {ENFORCEMENT_ACTIONS.map((a) => (
          <BigOption
            key={a}
            label={a}
            onClick={() => {
              setEnforcement(a);
              setStep("confirm");
            }}
          />
        ))}
      </StepShell>
    );
  }

  return (
    <StepShell
      title="Log this inspection?"
      step={4}
      steps={5}
      onBack={() => setStep("enforcement")}
    >
      <div
        className="rounded-xl px-4 py-3 text-sm space-y-1"
        style={{ background: "rgba(0,160,80,0.07)" }}
      >
        <div className="font-black text-base">{facilityName}</div>
        <div className="flex flex-wrap gap-1">
          <span className="chip slate">{type}</span>
          <span className="chip">{outcome}</span>
          {enforcement ? <span className="chip red">{enforcement}</span> : null}
        </div>
        <div className="text-gunmetal/60 tabular">
          {date} · {weekLabel}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm px-1">
        <input
          type="checkbox"
          checked={cardIssued}
          onChange={(e) => setCardIssued(e.target.checked)}
        />
        <span>
          Inspection card issued — valid to{" "}
          <strong className="tabular">{cardExpiry(date)}</strong>
        </span>
      </label>
      <textarea
        className="input"
        rows={2}
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <BigSubmit onClick={submit} disabled={busy}>
        {busy ? "Saving…" : "Log inspection ✓"}
      </BigSubmit>
    </StepShell>
  );
}

// ---------------------------------------------------------------------------
// Counts & notes: what → (border) → how many / note text → done
// ---------------------------------------------------------------------------

function CountFlow({
  section,
  date,
  weekLabel,
  user,
  borders,
  canManageBorders,
  plan,
  onLogged,
}: {
  section: Section;
  date: string;
  weekLabel: string;
  user: QuickLogUser;
  borders: Border[];
  canManageBorders: boolean;
  plan?: Subprogramme[];
  onLogged: () => void;
}) {
  const toast = useToast();
  const options = useMemo(
    () => dailyMetricOptions(section, plan),
    [section, plan],
  );

  type Pick = { key: string; label: string } | "note";
  type Step = "what" | "border" | "amount" | "note" | "done";
  const [step, setStep] = useState<Step>("what");
  const [pick, setPick] = useState<Pick | null>(null);
  const [border, setBorder] = useState<string | null>(
    user.postedOffice || null,
  );
  const [amount, setAmount] = useState("");
  const [remark, setRemark] = useState("");
  const [showRemark, setShowRemark] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [newBorder, setNewBorder] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneMessage, setDoneMessage] = useState("");

  // Keyed, not labelled: the screening figure keeps its original metric key
  // (it is what the border scan log posts to) whatever the work plan calls it.
  const screeningKey = vehicleScreeningKey();
  const isScreening =
    pick !== null && pick !== "note" && pick.key === screeningKey;
  // A posted coordinator is never asked which post — theirs is the only one
  // they may file against, so the wizard is two steps for them too.
  const needsBorder = isScreening && !user.postedOffice;
  const activeBorders = borders.filter((b) => b.active);
  const steps = needsBorder ? 3 : 2;

  const reset = () => {
    setStep("what");
    setPick(null);
    setBorder(user.postedOffice || null);
    setAmount("");
    setRemark("");
    setShowRemark(false);
    setNoteText("");
  };

  const saveCount = async () => {
    if (pick === null || pick === "note" || busy) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.push("Enter a number greater than zero.", "error");
      return;
    }
    setBusy(true);
    try {
      const s = await store();
      await s.addDailyEntry({
        date,
        week: weekLabel,
        section,
        kind: "count",
        metricKey: pick.key,
        label: pick.label,
        value: Math.floor(n),
        text: remark.trim() || undefined,
        border: border || undefined,
        updatedBy: user.uid,
        updatedByName: user.name,
      });
      setDoneMessage(
        `${border ? `${border}: ` : ""}${Math.floor(n)} — ${pick.label.toLowerCase()}`,
      );
      setStep("done");
      onLogged();
    } catch (err) {
      toast.push(
        `Saving failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    if (!noteText.trim() || busy) return;
    setBusy(true);
    try {
      const s = await store();
      await s.addDailyEntry({
        date,
        week: weekLabel,
        section,
        kind: "note",
        text: noteText.trim(),
        updatedBy: user.uid,
        updatedByName: user.name,
      });
      setDoneMessage("Note added to today's log");
      setStep("done");
      onLogged();
    } catch (err) {
      toast.push(
        `Saving failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const addBorderInline = async () => {
    if (!newBorder.trim() || busy) return;
    setBusy(true);
    try {
      const s = await store();
      const b = await s.addBorder(newBorder.trim(), user.uid);
      setNewBorder("");
      setBorder(b.name);
      setStep("amount");
      onLogged();
    } catch (err) {
      toast.push(
        `Adding the border failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  if (step === "done") {
    return (
      <SuccessScreen
        message={`Logged ✓ ${doneMessage}`}
        sub="It's in today's log and counts toward this week's report."
        onAgain={reset}
      />
    );
  }

  if (step === "what") {
    return (
      <StepShell
        title="What are you logging?"
        sub={`${date} · ${weekLabel}`}
        step={0}
        steps={steps}
      >
        {options.map((o) => (
          <BigOption
            key={o.key}
            label={o.label}
            sub={
              o.supporting
                ? "Supporting figure"
                : `Work plan output ${o.outputId}`
            }
            onClick={() => {
              setPick(o);
              setStep(
                o.key === screeningKey && !user.postedOffice
                  ? "border"
                  : "amount",
              );
            }}
          />
        ))}
        <BigOption
          label="Write a note"
          sub="Anything else that happened today"
          muted
          onClick={() => {
            setPick("note");
            setStep("note");
          }}
        />
      </StepShell>
    );
  }

  if (step === "border") {
    return (
      <StepShell
        title="Which border post?"
        sub="Vehicles screened"
        step={1}
        steps={steps}
        onBack={() => setStep("what")}
      >
        {activeBorders.map((b) => (
          <BigOption
            key={b.id}
            label={b.name}
            onClick={() => {
              setBorder(b.name);
              setStep("amount");
            }}
          />
        ))}
        <BigOption
          label="Head office / other"
          muted
          onClick={() => {
            setBorder(null);
            setStep("amount");
          }}
        />
        {canManageBorders ? (
          <div className="flex gap-2 pt-1">
            <input
              className="input"
              placeholder="Add a border post…"
              value={newBorder}
              onChange={(e) => setNewBorder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addBorderInline();
              }}
            />
            <button
              className="btn btn-secondary shrink-0"
              disabled={busy || !newBorder.trim()}
              onClick={addBorderInline}
            >
              Add
            </button>
          </div>
        ) : null}
      </StepShell>
    );
  }

  if (step === "note") {
    return (
      <StepShell
        title="What happened today?"
        step={steps - 1}
        steps={steps}
        onBack={() => setStep("what")}
      >
        <textarea
          className="input text-base"
          rows={4}
          autoFocus
          placeholder="Type your note…"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
        />
        <BigSubmit onClick={saveNote} disabled={busy || !noteText.trim()}>
          {busy ? "Saving…" : "Add note ✓"}
        </BigSubmit>
      </StepShell>
    );
  }

  // amount
  const n = Number(amount);
  const valid = Number.isFinite(n) && n > 0;
  const bump = (d: number) => {
    const cur = Number(amount);
    const base = Number.isFinite(cur) ? cur : 0;
    setAmount(String(Math.max(0, Math.floor(base + d))));
  };
  const label = pick !== null && pick !== "note" ? pick.label : "";

  return (
    <StepShell
      title="How many?"
      sub={`${label}${border ? ` · ${border}` : ""}`}
      step={steps - 1}
      steps={steps}
      onBack={() => setStep(needsBorder ? "border" : "what")}
    >
      <div className="flex items-center justify-center gap-2">
        <button
          className="btn btn-secondary text-base px-3 py-3"
          onClick={() => bump(-10)}
          aria-label="Minus ten"
        >
          −10
        </button>
        <button
          className="btn btn-secondary text-base px-3 py-3"
          onClick={() => bump(-1)}
          aria-label="Minus one"
        >
          −1
        </button>
        <input
          className="input text-center font-black tabular"
          style={{ fontSize: "1.75rem", maxWidth: 120, padding: "0.6rem" }}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="0"
          aria-label="How many"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
        />
        <button
          className="btn btn-secondary text-base px-3 py-3"
          onClick={() => bump(1)}
          aria-label="Plus one"
        >
          +1
        </button>
        <button
          className="btn btn-secondary text-base px-3 py-3"
          onClick={() => bump(10)}
          aria-label="Plus ten"
        >
          +10
        </button>
      </div>
      {showRemark ? (
        <input
          className="input"
          placeholder="Remark (optional)"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
        />
      ) : (
        <button
          className="text-xs caps font-bold text-gunmetal/60 w-full text-center py-1"
          onClick={() => setShowRemark(true)}
        >
          + Add a remark
        </button>
      )}
      <BigSubmit onClick={saveCount} disabled={busy || !valid}>
        {busy ? "Saving…" : valid ? `Log ${Math.floor(n)} ✓` : "Enter a number"}
      </BigSubmit>
    </StepShell>
  );
}
