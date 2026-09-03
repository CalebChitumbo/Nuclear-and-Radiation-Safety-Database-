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
    await setDoc(doc(db, "inspectionRequests/r1"), {
      facilityName: "Kitwe Central Hospital",
      type: "Pre-Authorisation",
      status: "Requested",
      timeline: [],
    });
    await setDoc(doc(db, "licenceWorkflows/w1"), { ran: "AUTH/USE.NEW/0203", notes: [] });
    await setDoc(doc(db, "aggregates/dashboard"), { total: 1 });
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
  });
});

// --- the register ------------------------------------------------------------

describe("the facilities register and what hangs off it", () => {
  const registerDocs = [
    "facilities/f1",
    "licenceEvents/e1",
    "inspections/i1",
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
