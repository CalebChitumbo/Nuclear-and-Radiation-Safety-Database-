# The audit log

Every change to a reporting figure — a screening count, a truck scan, the work
plan's opening balances — is recorded in the `auditLog` collection: who changed
it, when, and what it was before.

It exists because the cumulative figures are read as single numbers by people
who did not enter them. When one moves and nobody recognises the movement, the
question is always *who changed what*, and before this the collection itself was
the only answer.

## What writes it

Three Firestore triggers in [`functions/src/audit.ts`](../functions/src/audit.ts),
watching `dailyEntries`, `truckScans` and `workPlanBaseline`. What a change
*means* — the one-line summary, the changed fields, the movement in the figure —
lives in [`lib/rules/auditLog.ts`](../lib/rules/auditLog.ts) and is copied into
the functions bundle at build time, so the line an officer reads in the app is
written by the same code that recorded it.

A trigger rather than an app write, because an audit entry the app writes
alongside its own change is skippable: by a client that fails halfway, by a
script run with the Admin SDK, by an edit typed into the Firebase console. The
trigger sees all of those.

The security rules then deny **every** client write to `auditLog`, an
administrator's included — a log a person can edit is not a log. Only the
Admin SDK (which bypasses rules) can write it, and only the triggers do.

## What it records

| Field | |
| --- | --- |
| `at` | when the change landed |
| `collection`, `docId` | what was changed |
| `action` | `created` · `updated` · `deleted` |
| `actor`, `actorName` | the account the document names as its writer |
| `actorIsAuthor` | false on a delete — see below |
| `summary` | the one line a person reads |
| `changed` | each field that differs, with `from` and `to` |
| `before`, `after` | the whole document either side |
| `delta` | movement in the reported figure, on count entries |
| `section`, `border`, `date`, `metricKey` | denormalised, so the panel can filter |

A write that changed nothing a person did records nothing — replacing a figure
rewrites `createdAt`, and a no-op write would otherwise fill the log with rows
that say nothing.

## Who reads it

**In the app:** the *What changed* panel on the NSSS tab (`/nsss`). It shows
figures replaced, removed, or moved by more than 1,000 by default — a figure
being entered for the first time is the system working — with "show everything"
for the full trail and a per-row breakdown of exactly which fields moved.

**Scoping** mirrors the daily log: a section reads its own rows, a posted
officer their own post's, the department everything. The read rule compares
`resource.data.section` plainly rather than through `.get('section', '')` with a
default — that is what forces a section account's list query to filter on
section. Written the forgiving way, an unscoped list came back holding every
section's rows; there is a rules test pinning this.

Rows belonging to no section — only a work plan re-baseline makes those — stay
with the department for the same reason. [`scripts/screening-audit.ts`](../scripts/screening-audit.ts)
is where a re-baseline is traced from; see
[screening-figure-audit.md](screening-figure-audit.md).

## The one thing it cannot tell you

**Who deleted something.** A Firestore trigger is handed the document, not the
session that wrote it, so "who" comes from the document's own `updatedBy` /
`officerUid` — which the security rules force to match the signed-in account on
every create and update. A deleted document names its *author*, not whoever
removed it, so `actorIsAuthor` is false on a delete and the panel says
"removed by an unrecorded account".

This gap does not sit on the path that matters most: a screening figure is
corrected by overwriting the post-day document, which is an update and fully
attributed. If a deletion ever has to be pinned to a person, Cloud Logging's
Firestore data-access logs carry the authenticated principal.

## Deploying it

Both halves are deployed by hand — nothing in CI does it — and the log stays
empty until they are:

```bash
npm run deploy:rules
```

```bash
npm run deploy:functions
```

Rules and indexes first: the panel reads `auditLog` with a `(section, at desc)`
composite index, and Firestore denies every read of a collection no deployed
rule mentions. The functions second — they are what fills it. The app degrades
to an empty panel until then rather than failing.

The demo store (mock mode) has no functions behind it, so it keeps its own local
trail using the same shared builder — the panel behaves there the way it does in
the real thing.
