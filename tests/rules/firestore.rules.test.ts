/**
 * The security rules, exercised for real.
 *
 * `firestore.rules` is the only thing that actually keeps one section's records
 * from another — the navigation merely hides them — so the partition in
 * lib/rules/access.ts is checked here against the Firestore emulator, account
 * by account: an administrator, an officer of each section, an NSSS officer
 * posted to an inland office, and a signed-in account that has not been
 * approved. Run with `npm run test:rules`.
 */
import { readFileSync } from "node:fs";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const AS = "Authorisation & Standards";
const INSP = "Inspectorate";
const NSSS = "Nuclear Safety, Security & Safeguards";
const NSI = "National Source Inventory";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-rpa-rules",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

// --- the accounts ---------------------------------------------------------

const as = () =>
  env.authenticatedContext("u-as", { role: "officer", section: AS }).firestore();
const insp = () =>
  env.authenticatedContext("u-insp", { role: "officer", section: INSP }).firestore();
const nsssDesk = () =>
  env.authenticatedContext("u-nsss", { role: "officer", section: NSSS }).firestore();
// A second NSSS officer at head office - for the rules that turn on WHICH
// account in a section wrote a record, not just which section.
const nsssOther = () =>
  env.authenticatedContext("u-other", { role: "officer", section: NSSS }).firestore();
const nakonde = () =>
  env
    .authenticatedContext("u-nak", { role: "officer", section: NSSS, border: "Nakonde" })
    .firestore();
const nsi = () =>
  env.authenticatedContext("u-nsi", { role: "officer", section: NSI }).firestore();
const admin = () =>
  env.authenticatedContext("u-admin", { role: "admin", section: "All" }).firestore();
const pending = () => env.authenticatedContext("u-pending", {}).firestore();

// --- the records -----------------------------------------------------------

const task = (
  by: string,
  to: string,
  section: string,
  watcherUids: string[] = [],
  status = "Assigned",
) => ({
  title: "Respond to MoH letter",
  status,
  priority: "Normal",
  assignedByUid: by,
  assignedToUid: to,
  watcherUids,
  section,
  dueDate: "2026-09-30",
  assignedAt: "2026-09-14T08:00:00.000Z",
  events: [],
});

const scan = (border: string, officerUid = "u-nak") => ({
  date: "2026-09-01",
  week: "W36 2026",
  border,
  vehicleId: "T361DVG",
  cargoClass: "Food",
  commodity: "Maize",
  transporter: "Simba Logistics",
  doseNSvH: 40,
  result: "Normal",
  officerUid,
});

const entry = (section: string, border?: string, updatedBy = "u-nak") => ({
  date: "2026-09-01",
  week: "W36 2026",
  section,
  kind: "count",
  value: 12,
  updatedBy,
  ...(border ? { border } : {}),
});

const auditRow = (section: string, border?: string) => ({
  at: "2026-09-04T16:20:00.000Z",
  collection: "dailyEntries",
  docId: "d1",
  action: "updated",
  actor: "u-nak",
  actorName: "A. Phiri",
  actorIsAuthor: true,
  summary: "changed Vehicle Screening (units) from 180 to 6400",
  section,
  ...(border ? { border } : {}),
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "facilities/f1"), {
      name: "Kitwe Central Hospital",
      province: "Copperbelt",
      sector: "Public",
      licensed: true,
      stage: "Licensed",
    });
    await setDoc(doc(db, "licenceEvents/e1"), {
      date: "2026-08-01",
      week: "W31 2026",
      type: "Renewal of Use/Possession Licence",
      facilityName: "Kitwe Central Hospital",
    });
    await setDoc(doc(db, "inspections/i1"), {
      date: "2026-08-02",
      week: "W31 2026",
      type: "Routine Inspection",
      outcome: "Compliant",
    });
    await setDoc(doc(db, "inspectionCards/c1"), {
      issued: "2026-03-10",
      facilityId: "f1",
      facilityName: "Kitwe Central Hospital",
      province: "Copperbelt",
      nonCompliances: "No RPO appointed.",
      notes: "",
    });
    await setDoc(doc(db, "inspectionRequests/r1"), {
      facilityName: "Kitwe Central Hospital",
      type: "Pre-Authorisation",
      status: "Requested",
      timeline: [],
    });
    await setDoc(doc(db, "licenceWorkflows/w1"), { ran: "AUTH/USE.NEW/0203", notes: [] });
    await setDoc(doc(db, "aggregates/dashboard"), { total: 1 });
    // The reporting line: the administrator at the top, a senior in each
    // section under them (peers), the second NSSS officer and the Nakonde
    // coordinator under the NSSS senior, the Chirundu officer under the
    // Inspectorate senior. The NSI officer is NOT placed — no directory line.
    for (const [uid, section, reportsTo] of [
      ["u-admin", "All", ""],
      ["u-as", AS, "u-admin"],
      ["u-insp", INSP, "u-admin"],
      ["u-nsss", NSSS, "u-admin"],
      ["u-other", NSSS, "u-nsss"],
      ["u-nak", NSSS, "u-nsss"],
      ["u-chi", INSP, "u-insp"],
    ] as const) {
      await setDoc(doc(db, `directory/${uid}`), {
        uid,
        displayName: uid,
        section,
        ...(reportsTo ? { reportsTo } : {}),
        active: true,
      });
    }
    // A task the A&S senior gave their Inspectorate peer, watched by the
    // administrator; one the NSSS senior gave the second NSSS officer.
    await setDoc(doc(db, "tasks/t-peer"), task("u-as", "u-insp", INSP, ["u-admin"]));
    await setDoc(doc(db, "tasks/t-nsss"), task("u-nsss", "u-other", NSSS));
    await setDoc(doc(db, "inventoryEdits/rais:RAN1"), {
      id: "rais:RAN1",
      inventory: "rais",
      key: "RAN1",
      patch: {},
      updatedAt: "2026-09-01T00:00:00Z",
    });
    await setDoc(doc(db, "truckScans/s-nak"), scan("Nakonde"));
    await setDoc(doc(db, "truckScans/s-chi"), scan("Chirundu", "u-chi"));
    await setDoc(doc(db, "dailyEntries/d-nak"), entry(NSSS, "Nakonde"));
    await setDoc(doc(db, "dailyEntries/d-chi"), entry(NSSS, "Chirundu", "u-chi"));
    await setDoc(doc(db, "dailyEntries/d-nsss"), entry(NSSS, undefined, "u-nsss"));
    await setDoc(doc(db, "dailyEntries/d-as"), entry(AS, undefined, "u-as"));
    await setDoc(doc(db, "weekMetrics/W36 2026"), { week: "W36 2026", values: {} });
    await setDoc(doc(db, "borders/nakonde"), { name: "Nakonde", active: true });
    await setDoc(doc(db, "workPlanNotes/1.3.12"), { id: "1.3.12", status: "In Progress" });
    await setDoc(doc(db, "auditLog/a-nak"), auditRow(NSSS, "Nakonde"));
    await setDoc(doc(db, "auditLog/a-chi"), auditRow(NSSS, "Chirundu"));
    await setDoc(doc(db, "auditLog/a-nsss"), auditRow(NSSS));
    await setDoc(doc(db, "auditLog/a-as"), auditRow(AS));
    // A row about something no one section owns - the work plan's baseline.
    await setDoc(doc(db, "auditLog/a-dept"), {
      at: "2026-09-04T16:20:00.000Z",
      collection: "workPlanBaseline",
      docId: "2026",
      action: "updated",
      actor: "u-admin",
      actorName: "Demo Administrator",
      actorIsAuthor: true,
      summary: "saved the work plan opening balance",
    });
  });
});

// --- the register ------------------------------------------------------------

describe("the facilities register and what hangs off it", () => {
  const registerDocs = [
    "facilities/f1",
    "licenceEvents/e1",
    "inspections/i1",
    "inspectionCards/c1",
    "inspectionRequests/r1",
    "licenceWorkflows/w1",
    "aggregates/dashboard",
  ];

  it("is Licensing's, the Inspectorate's and the department's", async () => {
    for (const path of registerDocs) {
      await assertSucceeds(getDoc(doc(as(), path)));
      await assertSucceeds(getDoc(doc(insp(), path)));
      await assertSucceeds(getDoc(doc(admin(), path)));
    }
    await assertSucceeds(getDocs(collection(as(), "facilities")));
    await assertSucceeds(getDocs(collection(insp(), "inspections")));
  });

  it("is closed to NSSS, NSI, a posted officer and an unapproved account", async () => {
    for (const path of registerDocs) {
      await assertFails(getDoc(doc(nsssDesk(), path)));
      await assertFails(getDoc(doc(nsi(), path)));
      await assertFails(getDoc(doc(nakonde(), path)));
      await assertFails(getDoc(doc(pending(), path)));
    }
    await assertFails(getDocs(collection(nsssDesk(), "facilities")));
    await assertFails(getDocs(collection(nakonde(), "inspections")));
  });

  it("still lets only Licensing write facilities, and either section append notes", async () => {
    const fac = {
      name: "New Clinic",
      province: "Lusaka",
      sector: "Private",
      licensed: false,
      stage: "No Application Submitted",
    };
    await assertSucceeds(setDoc(doc(as(), "facilities/f2"), fac));
    await assertFails(setDoc(doc(insp(), "facilities/f3"), fac));
    await assertFails(setDoc(doc(nsssDesk(), "facilities/f4"), fac));

    await assertSucceeds(
      updateDoc(doc(insp(), "licenceWorkflows/w1"), {
        notes: [{ text: "Inspected." }],
        updatedAt: "2026-09-02T00:00:00Z",
        updatedBy: "u-insp",
      }),
    );
    await assertFails(
      updateDoc(doc(nsssDesk(), "licenceWorkflows/w1"), {
        notes: [{ text: "Not ours." }],
        updatedAt: "2026-09-02T00:00:00Z",
        updatedBy: "u-nsss",
      }),
    );
  });

  it("takes an undated inspection, but only from the Inspectorate", async () => {
    // The 2026 register hand-over records the visit but not the day for most of
    // its rows, so an inspection may be stored with no date and no week.
    const undated = {
      date: "",
      week: "",
      facilityName: "Ndola Teaching Hospital",
      type: "Routine Inspection",
      outcome: "N/A" as const,
    };
    await assertSucceeds(setDoc(doc(insp(), "inspections/i-undated"), undated));
    await assertFails(setDoc(doc(as(), "inspections/i-as"), undated));
    await assertFails(setDoc(doc(nsssDesk(), "inspections/i-nsss"), undated));
  });

  it("still insists a dated inspection is properly dated and filed", async () => {
    const base = {
      facilityName: "Ndola Teaching Hospital",
      type: "Routine Inspection",
      outcome: "N/A" as const,
    };
    // A date the calendar cannot read is not "no date" — it is a typo.
    await assertFails(
      setDoc(doc(insp(), "inspections/i-bad"), {
        ...base,
        date: "02/08/2026",
        week: "",
      }),
    );
    // And a dated inspection still has to name the week it is reported in, or
    // it would fall out of the weekly rollup.
    await assertFails(
      setDoc(doc(insp(), "inspections/i-noweek"), {
        ...base,
        date: "2026-08-02",
        week: "",
      }),
    );
    await assertSucceeds(
      setDoc(doc(insp(), "inspections/i-ok"), {
        ...base,
        date: "2026-08-02",
        week: "W31 2026",
      }),
    );
  });
});

describe("inspection cards recorded on their own", () => {
  const past = {
    issued: "2026-03-10",
    facilityId: "f1",
    facilityName: "Kitwe Central Hospital",
    province: "Copperbelt",
    nonCompliances: "No RPO appointed; no dose records.",
    notes: "",
  };

  it("are the Inspectorate's to record, correct and remove — nobody else's", async () => {
    await assertSucceeds(setDoc(doc(insp(), "inspectionCards/c2"), past));
    await assertSucceeds(
      setDoc(doc(insp(), "inspectionCards/c1"), { ...past, reference: "IC/0042" }),
    );
    // Unlike an inspection, a card counts toward nothing, so the section may
    // take one off the register itself.
    await assertSucceeds(deleteDoc(doc(insp(), "inspectionCards/c1")));

    await assertFails(setDoc(doc(as(), "inspectionCards/c3"), past));
    await assertFails(setDoc(doc(nsssDesk(), "inspectionCards/c4"), past));
    await assertFails(setDoc(doc(nsi(), "inspectionCards/c5"), past));
    await assertFails(setDoc(doc(nakonde(), "inspectionCards/c6"), past));
    await assertFails(setDoc(doc(pending(), "inspectionCards/c7"), past));
    await assertFails(deleteDoc(doc(as(), "inspectionCards/c2")));
  });

  it("must carry the day issued, the facility and the card's text", async () => {
    // A card is issued on a day, always — there is no undated card.
    await assertFails(setDoc(doc(insp(), "inspectionCards/bad-1"), { ...past, issued: "" }));
    await assertFails(
      setDoc(doc(insp(), "inspectionCards/bad-2"), { ...past, issued: "10/03/2026" }),
    );
    await assertFails(
      setDoc(doc(insp(), "inspectionCards/bad-3"), { ...past, facilityName: "" }),
    );
    const { nonCompliances: _nc, ...noText } = past;
    void _nc;
    await assertFails(setDoc(doc(insp(), "inspectionCards/bad-4"), noText));
    await assertFails(
      setDoc(doc(insp(), "inspectionCards/bad-5"), { ...past, reference: "x".repeat(81) }),
    );
    // A card to a facility not yet on the register names it in free text.
    await assertSucceeds(
      setDoc(doc(insp(), "inspectionCards/ok"), {
        ...past,
        facilityId: null,
        facilityName: "Mongu Clinic",
        province: "",
        district: "Mongu",
      }),
    );
  });
});

describe("the source inventories' corrections", () => {
  it("are read and written by NSI and the department only", async () => {
    await assertSucceeds(getDoc(doc(nsi(), "inventoryEdits/rais:RAN1")));
    await assertSucceeds(getDocs(collection(admin(), "inventoryEdits")));
    await assertFails(getDoc(doc(as(), "inventoryEdits/rais:RAN1")));
    await assertFails(getDoc(doc(insp(), "inventoryEdits/rais:RAN1")));
    await assertFails(getDoc(doc(nsssDesk(), "inventoryEdits/rais:RAN1")));
    await assertFails(getDoc(doc(nakonde(), "inventoryEdits/rais:RAN1")));
  });
});

// --- the border scan log --------------------------------------------------------

describe("the border scan log", () => {
  it("is every post's for NSSS at head office and the department", async () => {
    await assertSucceeds(getDocs(collection(nsssDesk(), "truckScans")));
    await assertSucceeds(getDoc(doc(nsssDesk(), "truckScans/s-chi")));
    await assertSucceeds(getDocs(collection(admin(), "truckScans")));
  });

  it("is the officer's own post's, and only that, when posted", async () => {
    const db = nakonde();
    await assertSucceeds(getDoc(doc(db, "truckScans/s-nak")));
    await assertFails(getDoc(doc(db, "truckScans/s-chi")));
    // The queries the capture screen runs for a posted officer …
    await assertSucceeds(
      getDocs(
        query(
          collection(db, "truckScans"),
          where("border", "==", "Nakonde"),
          orderBy("date", "desc"),
          limit(50),
        ),
      ),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db, "truckScans"),
          where("week", "==", "W36 2026"),
          where("border", "==", "Nakonde"),
        ),
      ),
    );
    // … and the ones it must not: anything not pinned to the post.
    await assertFails(getDocs(collection(db, "truckScans")));
    await assertFails(
      getDocs(query(collection(db, "truckScans"), where("week", "==", "W36 2026"))),
    );
    await assertFails(
      getDocs(query(collection(db, "truckScans"), where("border", "==", "Chirundu"))),
    );
  });

  it("is closed to the other sections", async () => {
    await assertFails(getDocs(collection(as(), "truckScans")));
    await assertFails(getDoc(doc(insp(), "truckScans/s-nak")));
    await assertFails(getDoc(doc(nsi(), "truckScans/s-nak")));
  });

  it("takes a posted officer's scans for their own post only", async () => {
    await assertSucceeds(setDoc(doc(nakonde(), "truckScans/new-1"), scan("Nakonde")));
    await assertFails(setDoc(doc(nakonde(), "truckScans/new-2"), scan("Chirundu")));
    await assertFails(
      setDoc(doc(nakonde(), "truckScans/new-3"), scan("Nakonde", "u-someone-else")),
    );
    await assertSucceeds(setDoc(doc(nsssDesk(), "truckScans/new-4"), scan("Chirundu", "u-nsss")));
    await assertFails(setDoc(doc(as(), "truckScans/new-5"), scan("Nakonde", "u-as")));
  });

  it("lets an officer remove only the scans they logged", async () => {
    await assertSucceeds(deleteDoc(doc(nakonde(), "truckScans/s-nak")));
    await assertFails(deleteDoc(doc(nakonde(), "truckScans/s-chi")));
    await assertSucceeds(deleteDoc(doc(admin(), "truckScans/s-chi")));
  });
});

// --- the daily log ----------------------------------------------------------------

describe("the daily log", () => {
  it("is read whole by the department", async () => {
    await assertSucceeds(getDocs(collection(admin(), "dailyEntries")));
  });

  it("is read by section — the query must say which", async () => {
    await assertSucceeds(
      getDocs(query(collection(as(), "dailyEntries"), where("section", "==", AS))),
    );
    await assertSucceeds(
      getDocs(query(collection(nsssDesk(), "dailyEntries"), where("section", "==", NSSS))),
    );
    await assertSucceeds(getDoc(doc(nsssDesk(), "dailyEntries/d-chi")));
    await assertFails(getDocs(collection(as(), "dailyEntries")));
    await assertFails(
      getDocs(query(collection(as(), "dailyEntries"), where("section", "==", NSSS))),
    );
    await assertFails(getDoc(doc(as(), "dailyEntries/d-nak")));
    await assertFails(getDoc(doc(nsi(), "dailyEntries/d-as")));
  });

  it("is read by post when posted — section alone is not enough", async () => {
    const db = nakonde();
    await assertSucceeds(
      getDocs(
        query(
          collection(db, "dailyEntries"),
          where("section", "==", NSSS),
          where("border", "==", "Nakonde"),
        ),
      ),
    );
    await assertSucceeds(getDoc(doc(db, "dailyEntries/d-nak")));
    await assertFails(getDoc(doc(db, "dailyEntries/d-chi")));
    await assertFails(getDoc(doc(db, "dailyEntries/d-nsss")));
    await assertFails(
      getDocs(query(collection(db, "dailyEntries"), where("section", "==", NSSS))),
    );
    await assertFails(getDocs(collection(db, "dailyEntries")));
  });

  it("takes an officer's own section's entries, filed at their own post when posted", async () => {
    await assertSucceeds(setDoc(doc(as(), "dailyEntries/n1"), entry(AS, undefined, "u-as")));
    await assertFails(setDoc(doc(as(), "dailyEntries/n2"), entry(INSP, undefined, "u-as")));
    await assertSucceeds(
      setDoc(doc(nakonde(), "dailyEntries/n3"), entry(NSSS, "Nakonde", "u-nak")),
    );
    await assertFails(
      setDoc(doc(nakonde(), "dailyEntries/n4"), entry(NSSS, "Chirundu", "u-nak")),
    );
    // A posted officer may not file a figure with no post on it.
    await assertFails(setDoc(doc(nakonde(), "dailyEntries/n5"), entry(NSSS, undefined, "u-nak")));
    // Head office may.
    await assertSucceeds(
      setDoc(doc(nsssDesk(), "dailyEntries/n6"), entry(NSSS, undefined, "u-nsss")),
    );
    await assertSucceeds(
      setDoc(doc(nsssDesk(), "dailyEntries/n7"), entry(NSSS, "Chirundu", "u-nsss")),
    );
    await assertFails(setDoc(doc(pending(), "dailyEntries/n8"), entry(AS, undefined, "u-pending")));
  });

  it("lets the section correct a post-day figure somebody else wrote", async () => {
    // d-nak is Nakonde's 2026-09-01 figure, written by u-nak. A later shift,
    // the desk, or a correction over the workbook import must be able to
    // replace it - one post, one day, one figure.
    await assertSucceeds(
      setDoc(doc(nsssDesk(), "dailyEntries/d-nak"), entry(NSSS, "Nakonde", "u-nsss")),
    );
    await assertSucceeds(
      setDoc(doc(nakonde(), "dailyEntries/d-nak"), entry(NSSS, "Nakonde", "u-nak")),
    );
  });

  it("will not let a correction move somebody's figure to another post or day", async () => {
    await assertFails(
      setDoc(doc(nsssDesk(), "dailyEntries/d-nak"), entry(NSSS, "Chirundu", "u-nsss")),
    );
    await assertFails(
      setDoc(doc(nsssDesk(), "dailyEntries/d-nak"), {
        ...entry(NSSS, "Nakonde", "u-nsss"),
        date: "2026-09-02",
      }),
    );
    // Nor may it be signed as somebody else, or reach outside the section.
    await assertFails(
      setDoc(doc(nsssDesk(), "dailyEntries/d-nak"), entry(NSSS, "Nakonde", "u-nak")),
    );
    await assertFails(
      setDoc(doc(as(), "dailyEntries/d-nak"), entry(NSSS, "Nakonde", "u-as")),
    );
    // A posted officer still cannot reach another post's document.
    await assertFails(
      setDoc(doc(nakonde(), "dailyEntries/d-chi"), entry(NSSS, "Chirundu", "u-nak")),
    );
  });

  it("is an administrator's to correct, whoever wrote it and whatever it says", async () => {
    // The Daily Updates correction form leans on this: a figure typed by
    // mistake is the department's to put right, including moving it to the day
    // or the post it belonged to. The audit log records the change either way.
    await assertSucceeds(
      setDoc(doc(admin(), "dailyEntries/d-nak"), {
        ...entry(NSSS, "Nakonde", "u-admin"),
        value: 6,
        loggedBy: "u-nak",
        loggedByName: "A. Phiri",
      }),
    );
    await assertSucceeds(
      setDoc(doc(admin(), "dailyEntries/d-nak"), {
        ...entry(NSSS, "Nakonde", "u-admin"),
        date: "2026-09-02",
      }),
    );
    await assertSucceeds(
      setDoc(doc(admin(), "dailyEntries/d-as"), entry(AS, undefined, "u-admin")),
    );
    // Moving a post-day figure means moving the DOCUMENT, so the correction
    // ends with the old one being removed.
    await assertSucceeds(deleteDoc(doc(admin(), "dailyEntries/d-chi")));
  });

  it("still keeps an entry with no post the author's own to edit", async () => {
    // d-nsss carries no border, so it is not a post-day figure: only u-nsss,
    // who wrote it, may change it.
    await assertSucceeds(
      setDoc(doc(nsssDesk(), "dailyEntries/d-nsss"), entry(NSSS, undefined, "u-nsss")),
    );
    await assertFails(
      setDoc(doc(nsssOther(), "dailyEntries/d-nsss"), entry(NSSS, undefined, "u-other")),
    );
  });
});

// --- the weekly report and the section's own desk -----------------------------------

describe("the weekly report's collections", () => {
  it("are any head-office officer's, and no posted officer's", async () => {
    await assertSucceeds(getDoc(doc(as(), "weekMetrics/W36 2026")));
    await assertSucceeds(getDoc(doc(nsi(), "workPlanNotes/1.3.12")));
    await assertSucceeds(getDoc(doc(nsssDesk(), "weekMetrics/W36 2026")));
    await assertSucceeds(
      setDoc(doc(insp(), "workPlanNotes/1.2.4"), {
        id: "1.2.4",
        status: "In Progress",
        updatedBy: "u-insp",
      }),
    );
    await assertFails(getDoc(doc(nakonde(), "weekMetrics/W36 2026")));
    await assertFails(getDoc(doc(nakonde(), "workPlanNotes/1.3.12")));
    await assertFails(
      setDoc(doc(nakonde(), "workPlanNotes/1.3.12"), {
        id: "1.3.12",
        status: "Achieved",
        updatedBy: "u-nak",
      }),
    );
    await assertFails(getDoc(doc(pending(), "weekMetrics/W36 2026")));
  });
});

describe("the audit log", () => {
  it("is read by the section whose figures it describes", async () => {
    await assertSucceeds(
      getDocs(query(collection(nsssDesk(), "auditLog"), where("section", "==", NSSS))),
    );
    await assertSucceeds(getDoc(doc(nsssDesk(), "auditLog/a-chi")));
    await assertSucceeds(getDocs(collection(admin(), "auditLog")));
    // Another section's rows, either way round.
    await assertFails(getDoc(doc(as(), "auditLog/a-nak")));
    await assertFails(getDoc(doc(nsssDesk(), "auditLog/a-as")));
    // An unscoped list, which would otherwise come back holding every
    // section's rows - the reason the read rule compares the section field
    // plainly rather than through .get() with a default.
    await assertFails(getDocs(collection(nsssDesk(), "auditLog")));
    await assertFails(
      getDocs(query(collection(nsssDesk(), "auditLog"), where("section", "==", AS))),
    );
    await assertFails(getDocs(collection(pending(), "auditLog")));
  });

  it("gives a posted officer their own post's rows and no others", async () => {
    const db = nakonde();
    await assertSucceeds(
      getDocs(
        query(
          collection(db, "auditLog"),
          where("section", "==", NSSS),
          where("border", "==", "Nakonde"),
        ),
      ),
    );
    await assertSucceeds(getDoc(doc(db, "auditLog/a-nak")));
    await assertFails(getDoc(doc(db, "auditLog/a-chi")));
    // A row with no post is the section desk's, not a posted officer's.
    await assertFails(getDoc(doc(db, "auditLog/a-nsss")));
  });

  it("keeps the rows that belong to no section with the department", async () => {
    // Only a re-baseline of the work plan makes one. A section account's read
    // is a plain section comparison - which is what forces its list query to
    // be scoped - so a row with no section field is the department's alone.
    await assertSucceeds(getDoc(doc(admin(), "auditLog/a-dept")));
    await assertFails(getDoc(doc(nsssDesk(), "auditLog/a-dept")));
    await assertFails(getDoc(doc(nakonde(), "auditLog/a-dept")));
  });

  it("is written by nobody at all — a log a person can edit is not a log", async () => {
    for (const db of [admin(), nsssDesk(), nakonde(), as()]) {
      await assertFails(setDoc(doc(db, "auditLog/new"), auditRow(NSSS, "Nakonde")));
      await assertFails(
        updateDoc(doc(db, "auditLog/a-nak"), { summary: "nothing happened" }),
      );
      await assertFails(deleteDoc(doc(db, "auditLog/a-nak")));
    }
  });
});

describe("the border register", () => {
  it("is readable by every officer, posted ones included, and kept by the NSSS desk", async () => {
    await assertSucceeds(getDocs(collection(nakonde(), "borders")));
    await assertSucceeds(getDocs(collection(as(), "borders")));
    await assertSucceeds(
      setDoc(doc(nsssDesk(), "borders/mwami"), { name: "Mwami", active: true }),
    );
    await assertFails(setDoc(doc(nakonde(), "borders/mwami"), { name: "Mwami", active: true }));
    await assertFails(setDoc(doc(as(), "borders/mwami"), { name: "Mwami", active: true }));
    await assertFails(getDocs(collection(pending(), "borders")));
  });
});

// --- the staff directory and the Tasks desk ---------------------------------

describe("the staff directory", () => {
  it("is readable by every approved officer, posted ones included, and written by administrators only", async () => {
    await assertSucceeds(getDocs(collection(as(), "directory")));
    await assertSucceeds(getDocs(collection(nakonde(), "directory")));
    await assertSucceeds(getDoc(doc(nsi(), "directory/u-as")));
    await assertFails(getDocs(collection(pending(), "directory")));
    await assertSucceeds(
      setDoc(doc(admin(), "directory/u-new"), { uid: "u-new", displayName: "New", section: AS, active: true }),
    );
    await assertFails(
      setDoc(doc(as(), "directory/u-new"), { uid: "u-new", displayName: "New", section: AS, active: true }),
    );
    await assertFails(updateDoc(doc(nsssDesk(), "directory/u-nak"), { reportsTo: "u-nsss" }));
  });
});

describe("the Tasks desk", () => {
  it("lets work be given to a direct report, a peer, one's own supervisor and oneself", async () => {
    await assertSucceeds(setDoc(doc(nsssDesk(), "tasks/new-1"), task("u-nsss", "u-other", NSSS)));
    await assertSucceeds(setDoc(doc(as(), "tasks/new-2"), task("u-as", "u-insp", INSP)));
    await assertSucceeds(setDoc(doc(nsssOther(), "tasks/new-3"), task("u-other", "u-nsss", NSSS)));
    await assertSucceeds(setDoc(doc(as(), "tasks/new-4"), task("u-as", "u-as", AS)));
    // A posted coordinator gives their peer work, and their supervisor.
    await assertSucceeds(setDoc(doc(nakonde(), "tasks/new-5"), task("u-nak", "u-other", NSSS)));
    await assertSucceeds(setDoc(doc(nakonde(), "tasks/new-6"), task("u-nak", "u-nsss", NSSS)));
  });

  it("refuses an officer off the line, and the department's top reaching two levels down", async () => {
    await assertFails(setDoc(doc(as(), "tasks/bad-1"), task("u-as", "u-other", NSSS)));
    await assertFails(setDoc(doc(as(), "tasks/bad-2"), task("u-as", "u-nak", NSSS)));
    // Two levels down one's own line goes through the senior in between —
    // unless the account is an administrator, who may reach anyone.
    await assertSucceeds(setDoc(doc(admin(), "tasks/ok-admin"), task("u-admin", "u-nak", NSSS)));
  });

  it("insists the task is given by the account writing it, opened Assigned, and well-formed", async () => {
    await assertFails(setDoc(doc(as(), "tasks/bad-3"), task("u-insp", "u-as", AS)));
    await assertFails(setDoc(doc(as(), "tasks/bad-4"), task("u-as", "u-insp", INSP, [], "Closed")));
    await assertFails(setDoc(doc(as(), "tasks/bad-5"), { ...task("u-as", "u-insp", INSP), title: "" }));
    await assertFails(setDoc(doc(as(), "tasks/bad-6"), { ...task("u-as", "u-insp", INSP), dueDate: "30/09/2026" }));
    await assertFails(setDoc(doc(pending(), "tasks/bad-7"), task("u-pending", "u-pending", AS)));
    // An account with no directory line can give work to nobody but itself.
    await assertFails(setDoc(doc(nsi(), "tasks/bad-8"), task("u-nsi", "u-as", AS)));
  });

  it("is read by the parties, the watchers, the section and the department", async () => {
    await assertSucceeds(getDoc(doc(as(), "tasks/t-peer")));
    await assertSucceeds(getDoc(doc(insp(), "tasks/t-peer")));
    await assertSucceeds(getDoc(doc(admin(), "tasks/t-peer")));
    // Filed under the officer's section, so the rest of the Inspectorate
    // reads it and the rest of A&S does not.
    await assertFails(getDoc(doc(nsssDesk(), "tasks/t-peer")));
    await assertFails(getDoc(doc(nsi(), "tasks/t-peer")));
    await assertFails(getDoc(doc(pending(), "tasks/t-peer")));
    // The NSSS task: the section's, the posted coordinator's too.
    await assertSucceeds(getDoc(doc(nakonde(), "tasks/t-nsss")));
    await assertFails(getDoc(doc(as(), "tasks/t-nsss")));
  });

  it("answers the four scoped list queries and refuses an unscoped one from a section officer", async () => {
    const col = collection(as(), "tasks");
    await assertSucceeds(getDocs(query(col, where("assignedToUid", "==", "u-as"))));
    await assertSucceeds(getDocs(query(col, where("assignedByUid", "==", "u-as"))));
    await assertSucceeds(getDocs(query(col, where("watcherUids", "array-contains", "u-as"))));
    await assertSucceeds(getDocs(query(col, where("section", "==", AS))));
    await assertFails(getDocs(query(col, where("section", "==", INSP))));
    await assertFails(getDocs(col));
    await assertSucceeds(getDocs(collection(admin(), "tasks")));
  });

  it("lets anyone on the task move it, never re-writing who gave it or when", async () => {
    await assertSucceeds(
      updateDoc(doc(insp(), "tasks/t-peer"), { status: "In Progress", startedAt: "2026-09-15T08:00:00.000Z" }),
    );
    await assertSucceeds(updateDoc(doc(admin(), "tasks/t-peer"), { events: [{ kind: "comment" }] }));
    await assertFails(updateDoc(doc(insp(), "tasks/t-peer"), { assignedByUid: "u-insp" }));
    await assertFails(updateDoc(doc(insp(), "tasks/t-peer"), { assignedAt: "2026-01-01T00:00:00.000Z" }));
    await assertFails(updateDoc(doc(nsssDesk(), "tasks/t-peer"), { status: "Closed" }));
  });

  it("hands a task to someone else only from the account that gave it, along the line", async () => {
    // The officer may not pass it sideways themselves.
    await assertFails(updateDoc(doc(insp(), "tasks/t-peer"), { assignedToUid: "u-nsss" }));
    // The assigner may, to another peer; not to someone off their line
    // (the Chirundu officer is under the Inspectorate senior, not the NSSS one).
    await assertSucceeds(updateDoc(doc(as(), "tasks/t-peer"), { assignedToUid: "u-nsss", section: NSSS }));
    await assertFails(updateDoc(doc(nsssDesk(), "tasks/t-nsss"), { assignedToUid: "u-chi", section: INSP }));
  });

  it("is deleted by administrators only", async () => {
    await assertFails(deleteDoc(doc(as(), "tasks/t-peer")));
    await assertSucceeds(deleteDoc(doc(admin(), "tasks/t-peer")));
  });
});
