# The Tasks desk — design note (Sep 2026)

## What it is

A supervisor gives an officer a piece of work — respond to a letter, draft a
memo, review an application — and both can see it: the officer as something
on their desk with a deadline, the supervisor as something out with someone,
with a date it is due back and a record of when it was opened, when it came
back and whether it was on time. The desk is `/tasks`, in the Workflow group;
every account has one, the posted border coordinators included.

## The reporting line

Who may give work to whom is read off the department's reporting line, which
an administrator sets on the Users desk (`/admin/users`) with two fields on
each account:

| Field       | Meaning                                                            |
| ----------- | ------------------------------------------------------------------ |
| `grade`     | The post: Director (DNRS) · Manager (MNRS) · Senior Officer (SNRSO) · Officer (NRSO) · Technologist (NRST). A label; nothing is gated on it. |
| `reportsTo` | The uid of the immediate supervisor. The Director reports to nobody. |

The rule is short, and `firestore.rules` enforces the same three cases against
the staff directory that `assignmentBlocker` in `lib/rules/tasks.ts` checks
on the client:

- a task goes to a **direct report**, a **peer** (someone with the same
  immediate supervisor) or one's **own supervisor**, and to nobody else;
- anyone else is reached **through their supervisor**, who is given the task
  and passes it on. The refusal says so by name: *"Officer Insp reports to
  Senior Insp. Assign it to Senior Insp, who can pass it on."*
- when peers task each other the shared supervisor is put **in the loop** as a
  watcher, so nothing is assigned without the immediate supervisor knowing;
- an officer may always add a task to their **own** desk; an administrator may
  reach anyone.

So the Manager gives the Senior Officer of Authorisation & Standards the
Board paper; the Senior Officer **passes on** the figures to their Officer,
which creates a linked task on the Officer's desk while the paper stays open
on the Senior Officer's until they hand it back up themselves. A Senior
Officer in A&S who needs an Inspectorate officer's input gives the task to
the Senior Officer of the Inspectorate (a peer), who passes it down.

An account with no grade and no supervisor is **not placed**: it can be given
work by nobody but itself and an administrator, the Users desk flags it, and
its own Tasks desk says so. Placing everyone is the administrator's first job
after this ships.

### The staff directory

`users/{uid}` is readable only by administrators, and the picker needs names.
So `directory/{uid}` carries the slice every approved officer may read —
name, section, office, grade, supervisor, and whether the account is active —
and it is what the rules `get()` to check the line. Two things write it:
`onUserDocWrite` mirrors every account write, and the Users desk writes it
directly so the administrator sees the change at once. Accounts that predate
the function have no line until they are next written:

```bash
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run sync:directory
```

writes one for every account, once, and can be re-run.

## The lifecycle

```
Assigned → In Progress → Submitted → Closed
                ↑            │
                └── returned ┘          Cancelled: from any live state, by the assigner
```

The officer's "done" is not the end. They **hand back** the task with an
outcome — *Done*, or *Not done* with a reason — and it moves to the assigner's
queue. The assigner **accepts and closes** it, or **returns** it with comments
(and optionally a new deadline), which puts it back on the officer's desk as
*In Progress* and counts a return. A task waiting on the assigner reads as
theirs, not the officer's: that is what makes the follow-up honest.

Everything is an event on the task (`events[]`): given, opened, started,
handed back, returned, closed, cancelled, reassigned, deadline moved, extension
asked for / approved / declined, passed on, comment. Editing the deadline after
assignment is a recorded move with a reason, and the original deadline is kept
on the record (`originalDueDate`), so the goalposts cannot be moved quietly.

What each party may do in each state is `allowedTaskActions`:

| State       | Officer                                   | Assigner                                              |
| ----------- | ----------------------------------------- | ----------------------------------------------------- |
| Assigned    | start · hand back · ask for more time · pass on (if they have reports) | move deadline · reassign · cancel · answer an extension request |
| In Progress | hand back · ask for more time · pass on   | the same                                              |
| Submitted   | comment                                   | accept & close · return with comments · cancel        |
| Closed      | comment                                   | comment                                               |

Watchers may comment. An administrator may act on either side. A
self-assigned task gives its one party both sides, minus the theatre of
asking oneself for an extension.

## Deadlines and lateness — derived, never stored

`taskStanding` reads the standing off the dates each time the page is drawn:

- open with no deadline → *No deadline*; open and past it → *Overdue Nd*
  (red); due today, or within two days → amber; otherwise *On track*;
- handed back → *Awaiting review*, marked *Nd late* when it came back after
  the deadline; closed → *Closed on time* / *Closed · Nd late*.

Lateness is in calendar days against the deadline. **Turnaround** (given →
handed back) and **days on the desk** are in *working* days — weekends and
Zambia's public holidays skipped (`zambianPublicHolidays`: the fixed dates,
the Easter weekend, Heroes'/Unity Day, Farmers' Day; a holiday on a Sunday is
taken on the Monday). Nobody types hours; the timestamps say enough.

An officer can **ask for more time** with a date and a reason; the assigner
approves (the deadline moves, the original stays on record) or declines.

## The screens

- **My desk** — everything assigned to the account, grouped *Overdue · Due
  today · This week · Later · No deadline · Handed back · Recently closed*,
  soonest deadline first within each. Opening a task records that it was
  opened, so the assigner sees "not yet opened" until then.
- **Given out** — what the account has out: first what is *waiting on them*
  (handed back, or asking for time), then one row per officer — open, overdue,
  handed back, closed (and how many late), on-time rate, average turnaround
  in working days, and the longest anything has sat — then the tasks by
  status. Self-assigned tasks are nobody's statistics.
- **Section / Everyone** — every task the account may read, filtered by
  status and officer. An officer reads the tasks they are on and their
  section's; the department (an administrator, or the cross-section "All"
  posting — the Manager) reads all of them.
- The **badge** on the Tasks link counts what needs attention today: on the
  desk and overdue, due today or not yet opened, plus the review queue.
- The **Users desk** gains the two placement fields, a *Grade* and *Reports
  to* column, and the reporting line drawn as a tree.

## Data

`tasks/{id}` — see `Task` in `lib/rules/types.ts`. The uids and the section
are duplicated flat beside the parties (`assignedToUid`, `assignedByUid`,
`watcherUids`, `section`) because the reads are four single-field queries the
rules can prove: *assigned to me*, *assigned by me*, *watching*, *my
section*. No composite index is needed. A task is written whole on every
move, so a return drops the outcome and an answer drops the extension request
rather than leaving them behind under a merge.

`firestore.rules`: read on the task or in its section or the department;
create by the account named as assigner, opened *Assigned*, to someone on the
line (`mayAssignTo`, which `get()`s the directory); update by anyone on the
task, never changing who gave it or when, and handing it to someone else only
by the assigner and only along the line; delete admin only. The rules suite
(`tests/rules/firestore.rules.test.ts`, `npm run test:rules`) exercises each
case.

## Deliberately left out (for now)

- **Officer ratings** on completion and **typed time sheets** — both poison
  adoption; turnaround from the timestamps says enough.
- **Attachments** — there is no file storage in the stack. A task carries a
  reference (the letter's Ref No.) and a link (SharePoint, Drive).
- **Email or push** — notifications are the in-app badge, like the inspection
  handoff's. A daily digest would be a Cloud Function later.
- **Escalation** up the line when a task is long overdue, and **recurring**
  tasks. Both follow naturally from `reportsTo` once the desk is in use.
- **Logging a handed-back task as a Daily Update** line — a good next step so
  the daily report and the desk stop being two chores.
