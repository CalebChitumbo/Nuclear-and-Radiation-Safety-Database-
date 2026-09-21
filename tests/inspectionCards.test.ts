import { beforeEach, describe, expect, it } from "vitest";

import {
  buildInspectionCard,
  cardInPeriod,
  cardRegister,
  cardsNeedingAttention,
  countCardStatuses,
  currentCards,
  inspectionCardProblem,
} from "../lib/rules/inspectionCards";
import { cardDaysLeft } from "../lib/rules/inspectionDatabase";
import { mockStore, resetMockStore } from "../lib/store/mockStore";
import type { Facility, Inspection, InspectionCard, WeekDef } from "../lib/rules/types";

const TODAY = "2026-09-21";

const insp = (over: Partial<Inspection> = {}): Inspection => ({
  id: `i${Math.random()}`,
  date: "2026-09-01",
  week: "W36 2026",
  facilityId: "f1",
  facilityName: "Braceline Centre",
  type: "Routine Inspection",
  outcome: "Minor findings",
  province: "Lusaka",
  sector: "Private",
  notes: "",
  ...over,
});

const card = (over: Partial<InspectionCard> = {}): InspectionCard => ({
  id: `c${Math.random()}`,
  issued: "2026-03-10",
  facilityId: "f2",
  facilityName: "Kitwe Dental",
  province: "Copperbelt",
  nonCompliances: "No RPO appointed; no dose records.",
  notes: "",
  ...over,
});

const fac = (over: Partial<Facility> = {}): Facility => ({
  id: "f1",
  no: 1,
  name: "Braceline Centre",
  nameLower: "braceline centre",
  district: "Lusaka",
  province: "Lusaka",
  practice: "Diagnostic Imaging (X-ray)",
  sector: "Private",
  functional: true,
  category: "Medical",
  licensed: true,
  stage: "Licensed",
  facCode: "FAC/0001",
  auths: [],
  ...over,
});

const FACILITIES = [
  fac(),
  fac({
    id: "f2",
    no: 2,
    name: "Kitwe Dental",
    nameLower: "kitwe dental",
    district: "Kitwe",
    province: "Copperbelt",
  }),
];

describe("the inspection card register", () => {
  it("reads cards stamped on inspections and cards recorded on their own as one list", () => {
    const register = cardRegister(
      [
        insp({ id: "i1", cardIssued: "2026-09-01", notes: "Shielding survey overdue." }),
        insp({ id: "i2" }), // no card — not on the register
      ],
      [card({ id: "c1" })],
      FACILITIES,
      TODAY,
    );
    expect(register.map((r) => [r.key, r.source, r.facility])).toEqual([
      ["insp:i1", "inspection", "Braceline Centre"],
      ["card:c1", "record", "Kitwe Dental"],
    ]);
    // Each carries what the card was issued against, whichever way it came.
    expect(register[0].findings).toBe("Shielding survey overdue.");
    expect(register[1].findings).toBe("No RPO appointed; no dose records.");
  });

  it("derives expiry and standing from the day issued — never stored", () => {
    const [running, expiring, expired] = cardRegister(
      [],
      [
        card({ id: "running", issued: "2026-09-15" }),
        card({ id: "expiring", issued: "2026-08-25" }),
        card({ id: "expired", issued: "2026-03-10" }),
      ],
      FACILITIES,
      TODAY,
    );
    expect(running.expiry).toBe("2026-10-15");
    expect(running.status).toBe("Active");
    expect(expiring.expiry).toBe("2026-09-24");
    expect(expiring.status).toBe("Expiring Soon");
    expect(expired.expiry).toBe("2026-04-09");
    expect(expired.status).toBe("Expired");
    expect(cardDaysLeft(expired.expiry, TODAY)).toBe(-165);
    expect(
      countCardStatuses([running, expiring, expired]),
    ).toEqual({ Active: 1, "Expiring Soon": 1, Expired: 1 });
  });

  it("takes province and district off the register, and the typed ones off it", () => {
    const [onRegister, offRegister] = cardRegister(
      [],
      [
        card({ id: "on", facilityId: "f2", province: "", district: "" }),
        card({
          id: "off",
          issued: "2026-01-01",
          facilityId: null,
          facilityName: "Mongu Clinic",
          province: "",
          district: "Mongu",
        }),
      ],
      FACILITIES,
      TODAY,
    );
    expect([onRegister.province, onRegister.district]).toEqual(["Copperbelt", "Kitwe"]);
    expect([offRegister.province, offRegister.district]).toEqual(["", "Mongu"]);
  });

  it("lets a facility's latest card supersede its earlier one", () => {
    const register = cardRegister(
      [insp({ id: "i1", facilityId: "f2", facilityName: "Kitwe Dental", cardIssued: "2026-09-10" })],
      [card({ id: "old", issued: "2026-03-10" })],
      FACILITIES,
      TODAY,
    );
    // The register keeps both, newest first.
    expect(register.map((r) => r.key)).toEqual(["insp:i1", "card:old"]);
    // The standing is the latest card's — the March card no longer needs chasing.
    expect(currentCards(register).map((r) => r.key)).toEqual(["insp:i1"]);
    expect(cardsNeedingAttention(register)).toEqual([]);
  });

  it("matches a free-text facility to itself by name when it has no register id", () => {
    const register = cardRegister(
      [],
      [
        card({ id: "a", issued: "2026-02-01", facilityId: null, facilityName: "Mongu Clinic" }),
        card({ id: "b", issued: "2026-06-01", facilityId: null, facilityName: "MONGU  clinic" }),
      ],
      FACILITIES,
      TODAY,
    );
    expect(currentCards(register).map((r) => r.id)).toEqual(["b"]);
  });

  it("lists the cards needing attention expired-first, most overdue first", () => {
    const register = cardRegister(
      [],
      [
        card({ id: "soon", issued: "2026-08-28", facilityId: null, facilityName: "Soon" }),
        card({ id: "long-gone", issued: "2026-03-10", facilityId: null, facilityName: "Long Gone" }),
        card({ id: "just-gone", issued: "2026-08-15", facilityId: null, facilityName: "Just Gone" }),
        card({ id: "fine", issued: "2026-09-15", facilityId: null, facilityName: "Fine" }),
      ],
      FACILITIES,
      TODAY,
    );
    expect(cardsNeedingAttention(register).map((r) => [r.facility, r.status])).toEqual([
      ["Long Gone", "Expired"],
      ["Just Gone", "Expired"],
      ["Soon", "Expiring Soon"],
    ]);
  });

  it("files a card into the dashboard's period by the day it was issued", () => {
    const weeks: WeekDef[] = [
      { label: "W37 2026", start: "2026-09-07", end: "2026-09-13" },
      { label: "W38 2026", start: "2026-09-14", end: "2026-09-20" },
    ];
    const ctx = { week: weeks[0], today: TODAY };
    const [thisWeek, lastYear] = cardRegister(
      [],
      [card({ id: "w", issued: "2026-09-09" }), card({ id: "y", issued: "2025-11-02" })],
      FACILITIES,
      TODAY,
    );
    expect(cardInPeriod(thisWeek, "week", ctx, weeks)).toBe(true);
    expect(cardInPeriod(thisWeek, "month", ctx, weeks)).toBe(true);
    expect(cardInPeriod(thisWeek, "year", ctx, weeks)).toBe(true);
    expect(cardInPeriod(lastYear, "year", ctx, weeks)).toBe(false);
    expect(cardInPeriod(lastYear, "all", ctx, weeks)).toBe(true);
  });
});

describe("recording a card", () => {
  const input = {
    issued: "2026-03-10",
    facilityId: "f2",
    facilityName: "Kitwe Dental",
    nonCompliances: "No RPO appointed.",
    notes: "",
  };

  it("needs a facility and a real day that has already come", () => {
    expect(inspectionCardProblem(input, TODAY)).toBeNull();
    expect(inspectionCardProblem({ ...input, facilityName: "  " }, TODAY)).toMatch(/facility/);
    expect(inspectionCardProblem({ ...input, issued: "" }, TODAY)).toMatch(/date/);
    expect(inspectionCardProblem({ ...input, issued: "10/03/2026" }, TODAY)).toMatch(/date/);
    expect(inspectionCardProblem({ ...input, issued: "2026-09-22" }, TODAY)).toMatch(/not come yet/);
  });

  it("does not need the non-compliances — a past card may not have them to hand", () => {
    expect(inspectionCardProblem({ ...input, nonCompliances: "" }, TODAY)).toBeNull();
  });

  it("builds the record off the register facility, dropping blank optionals", () => {
    const rec = buildInspectionCard(
      { ...input, district: "typed-and-ignored", reference: "  ", notes: "  seen  " },
      FACILITIES,
    );
    expect(rec).toEqual({
      issued: "2026-03-10",
      facilityId: "f2",
      facilityName: "Kitwe Dental",
      province: "Copperbelt",
      district: "Kitwe",
      nonCompliances: "No RPO appointed.",
      notes: "seen",
    });
  });

  it("keeps a free-text facility's typed district and card number", () => {
    const rec = buildInspectionCard(
      {
        ...input,
        facilityId: null,
        facilityName: " Mongu Clinic ",
        district: "Mongu",
        reference: "IC/0042",
      },
      FACILITIES,
    );
    expect(rec).toMatchObject({
      facilityId: null,
      facilityName: "Mongu Clinic",
      province: "",
      district: "Mongu",
      reference: "IC/0042",
    });
  });
});

describe("mock store — recorded cards (the integration seam)", () => {
  beforeEach(() => resetMockStore());

  it("records, corrects, lists per facility and removes a card, moving no inspection", async () => {
    const facilities = await mockStore.listFacilities();
    const f = facilities[0];
    const before = (await mockStore.listInspections()).length;

    const created = await mockStore.addInspectionCard(
      buildInspectionCard(
        {
          issued: "2026-03-10",
          facilityId: f.id,
          facilityName: f.name,
          nonCompliances: "No RPO appointed.",
          notes: "",
        },
        facilities,
      ),
      "u-insp",
    );
    expect(created.id).toBeTruthy();
    expect(created.updatedBy).toBe("u-insp");
    expect((await mockStore.listInspectionCardsFor(f.id)).map((c) => c.id)).toEqual([created.id]);
    // A recorded card is not an inspection.
    expect((await mockStore.listInspections()).length).toBe(before);

    const fixed = await mockStore.updateInspectionCard(
      created.id,
      { issued: "2026-03-12", reference: "IC/0042" },
      "u-insp",
    );
    expect(fixed.issued).toBe("2026-03-12");
    expect(fixed.reference).toBe("IC/0042");
    expect(fixed.updatedAt).toBeTruthy();

    await mockStore.deleteInspectionCard(created.id);
    expect(await mockStore.listInspectionCards()).toEqual([]);
    await expect(
      mockStore.updateInspectionCard(created.id, { notes: "x" }),
    ).rejects.toThrow(/no longer on the register/);
  });

  it("goes out with the full export", async () => {
    await mockStore.addInspectionCard(card({ facilityId: null }));
    const dump = await mockStore.exportAll();
    expect(dump.inspectionCards).toHaveLength(1);
  });
});
