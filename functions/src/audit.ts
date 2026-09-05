/**
 * The append-only audit log — the Firestore side of it.
 *
 * WHY A TRIGGER AND NOT AN APP WRITE
 *
 * An audit entry the app writes alongside its own change is skippable: by a
 * client that fails halfway, by a script run with the Admin SDK, by an edit
 * made straight in the Firebase console. A trigger sees every one of those.
 * The security rules then deny every client write to `auditLog`, including an
 * administrator's — a log a person can edit is not a log.
 *
 * WHAT IT KNOWS
 *
 * A Firestore trigger is handed the document, not the session that wrote it, so
 * "who" comes from the document's own `updatedBy` / `officerUid`, which the
 * rules force to match the signed-in account on every create and update. A
 * DELETE is the exception: the removed document names its author, not whoever
 * removed it, so `actorIsAuthor` is false there. Screening figures are
 * corrected by overwriting the post-day document rather than by
 * delete-and-re-add, so that gap does not sit on the path that matters most;
 * Cloud Logging's Firestore data-access logs are where to look if a deletion
 * ever has to be pinned to a person.
 *
 * Every handler swallows its own errors: an audit log that could fail a
 * coordinator's entry at a border post would be worse than one with a gap in
 * it. The figure is the thing being protected, not the record of it.
 *
 * What each change MEANS lives in lib/rules/auditLog.ts and is copied in at
 * build time, so the line an officer reads in the app is written by the same
 * code that recorded it.
 */
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";

import {
  buildAuditEntry,
  type AuditedCollection,
} from "./rais/rules/auditLog";

function watch(collection: AuditedCollection) {
  return onDocumentWritten(
    { document: `${collection}/{id}`, region: "us-central1" },
    async (event) => {
      try {
        const entry = buildAuditEntry(
          collection,
          String(event.params.id),
          (event.data?.before?.data() as Record<string, unknown>) || null,
          (event.data?.after?.data() as Record<string, unknown>) || null,
        );
        // Null when the write changed nothing a person did.
        if (entry) await getFirestore().collection("auditLog").add(entry);
      } catch (err) {
        console.error(`Failed to record an audit entry for ${collection}`, err);
      }
    },
  );
}

export const onDailyEntryWrite = watch("dailyEntries");
export const onTruckScanWrite = watch("truckScans");
export const onWorkPlanBaselineWrite = watch("workPlanBaseline");
