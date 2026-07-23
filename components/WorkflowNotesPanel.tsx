"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { useToast } from "./Toast";
import { sortedNotes } from "@/lib/rules/workflowNotes";
import type { LicenceWorkflow, WorkflowNote } from "@/lib/rules/types";

/**
 * The notes & history trail of one licensing application: the officers'
 * comments interleaved with the automatic status entries, newest first, plus a
 * composer so the officer working on it can leave the background for whoever
 * picks it up next. Any signed-in officer may comment (the security rules
 * allow appending notes cross-section). Shared by the application-history
 * drawer on Smart Status Update and the facility drawer.
 */
export function WorkflowNotesPanel({
  workflow,
  isSaved = true,
  onChanged,
}: {
  workflow: LicenceWorkflow;
  /** False for a freshly parsed row not yet saved — the composer is disabled. */
  isSaved?: boolean;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [notes, setNotes] = useState<WorkflowNote[]>(() => sortedNotes(workflow));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  // Re-seed when a different application is shown (or a reload hands us a
  // fresher copy); a locally appended note survives because the reload includes it.
  useEffect(() => {
    setNotes(sortedNotes(workflow));
  }, [workflow]);

  const post = async () => {
    if (!user || busy) return;
    if (!text.trim()) {
      toast.push("Write the note first.", "error");
      return;
    }
    setBusy(true);
    try {
      const s = await store();
      const note = await s.addWorkflowNote(workflow.ran || workflow.id, text, {
        uid: user.uid,
        name: user.displayName,
        section: user.section,
      });
      setNotes((n) => [...n, note]);
      setText("");
      onChanged?.();
      toast.push("Note added to the application's history.", "success");
    } catch (err) {
      toast.push(
        `Could not add the note: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Composer first — leaving the note is the action this panel exists for. */}
      {user ? (
        <div>
          <label className="caps text-[10px] text-gunmetal/60">
            Leave a note for the next officer
          </label>
          <textarea
            className="input mt-1"
            rows={2}
            value={text}
            disabled={!isSaved}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Applicant promised proof of payment by Friday — don't regenerate the invoice."
          />
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <button
              className="btn btn-primary"
              disabled={busy || !isSaved}
              onClick={post}
            >
              {busy ? "Adding…" : "Add note"}
            </button>
            {!isSaved ? (
              <span className="text-[11px] text-gunmetal/55">
                Save the parsed applications to the database first — notes attach
                to the tracked record.
              </span>
            ) : (
              <span className="text-[11px] text-gunmetal/55">
                Visible to every officer who opens this application.
              </span>
            )}
          </div>
        </div>
      ) : null}

      {/* Timeline — newest first */}
      <div>
        <div className="caps text-[10px] text-gunmetal/60 mb-2">
          Notes &amp; history
        </div>
        {notes.length === 0 ? (
          <div className="text-sm text-gunmetal/55">
            No notes yet. Status changes and officer comments will build this
            application&apos;s history here.
          </div>
        ) : (
          <ul className="space-y-3">
            {[...notes].reverse().map((n) => (
              <li key={n.id} className="flex gap-3">
                <div
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs"
                  style={
                    n.kind === "comment"
                      ? { background: "rgba(0,160,80,0.12)", color: "#0b5" }
                      : { background: "rgba(44,93,122,0.12)", color: "#2C5D7A" }
                  }
                  aria-hidden="true"
                >
                  {n.kind === "comment" ? "❝" : "▸"}
                </div>
                <div className="min-w-0">
                  <div className="text-sm whitespace-pre-line break-words">
                    {n.text}
                  </div>
                  <div className="text-[11px] text-gunmetal/55">
                    {n.byName ||
                      (n.by === "rais-email-bot"
                        ? "RAIS email connector"
                        : "Officer")}
                    {n.bySection ? ` · ${n.bySection}` : ""} · {fmtWhen(n.at)}
                    {n.source === "email" ? " · via email" : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Raw RAIS feed — baseline history for records that predate the trail. */}
      {workflow.notifications?.length ? (
        <details>
          <summary className="text-[11px] text-gunmetal/50 cursor-pointer select-none">
            RAIS notifications seen for this application (
            {workflow.notifications.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {workflow.notifications.map((t, i) => (
              <li key={i} className="text-xs text-gunmetal/70">
                • {t}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
