import { describe, expect, it } from "vitest";

import {
  ROUTES,
  canOpen,
  dailyEntryScopes,
  homeFor,
  isPostedOfficer,
  mobileTabsFor,
  navFor,
  routeFor,
  sectionsFor,
  seesRegister,
  workspaceFor,
  type Viewer,
} from "../lib/rules/access";
import { SECTIONS } from "../lib/rules/types";

const NSSS = "Nuclear Safety, Security & Safeguards" as const;

const admin: Viewer = { role: "admin", section: "All" };
const department: Viewer = { role: "officer", section: "All" };
const licensing: Viewer = { role: "officer", section: "Authorisation & Standards" };
const inspector: Viewer = { role: "officer", section: "Inspectorate" };
const nsssDesk: Viewer = { role: "officer", section: NSSS };
const nakonde: Viewer = { role: "officer", section: NSSS, border: "Nakonde" };
const nsi: Viewer = { role: "officer", section: "National Source Inventory" };
// Accounts an administrator has placed in more than one section.
const licensingInsp: Viewer = {
  role: "officer",
  section: "Authorisation & Standards",
  extraSections: ["Inspectorate"],
};
const nakondeLicensing: Viewer = {
  role: "officer",
  section: NSSS,
  border: "Nakonde",
  extraSections: ["Authorisation & Standards"],
};

/** Every path the table knows, so a matrix can say who opens what. */
const every = ROUTES.map((r) => r.href);

function opens(user: Viewer): string[] {
  return every.filter((href) => canOpen(user, href));
}

describe("workspaceFor", () => {
  it("puts administrators and the cross-section posting in the department", () => {
    expect(workspaceFor(admin)).toEqual({ kind: "department" });
    expect(workspaceFor(department)).toEqual({ kind: "department" });
  });

  it("puts an ordinary officer in their section", () => {
    expect(workspaceFor(licensing)).toEqual({
      kind: "section",
      section: "Authorisation & Standards",
      sections: ["Authorisation & Standards"],
    });
    expect(workspaceFor(nsssDesk)).toEqual({ kind: "section", section: NSSS, sections: [NSSS] });
  });

  it("puts an NSSS officer with a posting at their post", () => {
    expect(workspaceFor(nakonde)).toEqual({ kind: "post", office: "Nakonde" });
    expect(isPostedOfficer(nakonde)).toBe(true);
    expect(isPostedOfficer(nsssDesk)).toBe(false);
  });

  it("never confines an administrator, whatever claims they carry", () => {
    const postedAdmin: Viewer = { role: "admin", section: NSSS, border: "Nakonde" };
    expect(workspaceFor(postedAdmin)).toEqual({ kind: "department" });
  });

  it("ignores a posting on a section that has none", () => {
    const odd: Viewer = { role: "officer", section: "Inspectorate", border: "Nakonde" };
    expect(workspaceFor(odd)).toEqual({ kind: "section", section: "Inspectorate", sections: ["Inspectorate"] });
  });

  it("has nothing for a signed-out visitor", () => {
    expect(workspaceFor(null)).toBeNull();
    expect(sectionsFor(null)).toEqual([]);
    expect(canOpen(null, "/")).toBe(false);
    expect(homeFor(null)).toBe("/login");
  });
});

describe("sectionsFor", () => {
  it("is all four for the department, one for a section, NSSS for a post", () => {
    expect(sectionsFor(admin)).toEqual([...SECTIONS]);
    expect(sectionsFor(inspector)).toEqual(["Inspectorate"]);
    expect(sectionsFor(nakonde)).toEqual([NSSS]);
  });
});

describe("seesRegister", () => {
  it("is Licensing's and the Inspectorate's", () => {
    expect(seesRegister(licensing)).toBe(true);
    expect(seesRegister(inspector)).toBe(true);
    expect(seesRegister(admin)).toBe(true);
    expect(seesRegister(nsssDesk)).toBe(false);
    expect(seesRegister(nsi)).toBe(false);
    expect(seesRegister(nakonde)).toBe(false);
  });
});

describe("dailyEntryScopes", () => {
  it("reads the whole log for the department, a section's for a section, a post's for a post", () => {
    expect(dailyEntryScopes(admin)).toBeUndefined();
    expect(dailyEntryScopes(nsi)).toEqual([{ section: "National Source Inventory" }]);
    expect(dailyEntryScopes(nakonde)).toEqual([{ section: NSSS, border: "Nakonde" }]);
  });

  it("gives an account in several sections one scope each, keeping the post on NSSS's", () => {
    expect(dailyEntryScopes(licensingInsp)).toEqual([
      { section: "Authorisation & Standards" },
      { section: "Inspectorate" },
    ]);
    expect(dailyEntryScopes(nakondeLicensing)).toEqual([
      { section: NSSS, border: "Nakonde" },
      { section: "Authorisation & Standards" },
    ]);
  });
});

describe("an account in more than one section", () => {
  it("works from a section workspace holding all of them, main section first", () => {
    expect(workspaceFor(licensingInsp)).toEqual({
      kind: "section",
      section: "Authorisation & Standards",
      sections: ["Authorisation & Standards", "Inspectorate"],
    });
    expect(sectionsFor(licensingInsp)).toEqual(["Authorisation & Standards", "Inspectorate"]);
  });

  it("opens the union of the sections' screens and nothing of the others", () => {
    const union = new Set([...opens(licensing), ...opens(inspector)]);
    expect(opens(licensingInsp).sort()).toEqual([...union].sort());
    expect(canOpen(licensingInsp, "/nsss")).toBe(false);
    expect(canOpen(licensingInsp, "/source-inventory")).toBe(false);
    expect(canOpen(licensingInsp, "/admin/users")).toBe(false);
    expect(seesRegister(licensingInsp)).toBe(true);
    expect(seesRegister({ role: "officer", section: NSSS, extraSections: ["Inspectorate"] })).toBe(true);
  });

  it("lands on the main section's front door", () => {
    expect(homeFor(licensingInsp)).toBe("/");
    expect(homeFor({ role: "officer", section: "Inspectorate", extraSections: ["National Source Inventory"] })).toBe("/inspectorate");
  });

  it("is not confined to the scan log by a post when it works elsewhere too", () => {
    expect(isPostedOfficer(nakondeLicensing)).toBe(false);
    expect(canOpen(nakondeLicensing, "/facilities")).toBe(true);
    expect(canOpen(nakondeLicensing, "/border")).toBe(true);
    expect(canOpen(nakondeLicensing, "/inspectorate")).toBe(false);
    expect(mobileTabsFor(nakondeLicensing).length).toBeGreaterThan(0);
  });

  it("ignores a repeat of the main section and names that are not sections", () => {
    const odd = {
      role: "officer",
      section: "Inspectorate",
      extraSections: ["Inspectorate", "Finance"],
    } as unknown as Viewer;
    expect(sectionsFor(odd)).toEqual(["Inspectorate"]);
  });

  it("gives a plain one-section account exactly what it had", () => {
    expect(sectionsFor(licensing)).toEqual(["Authorisation & Standards"]);
    expect(sectionsFor({ ...licensing!, extraSections: [] })).toEqual(["Authorisation & Standards"]);
  });
});

describe("canOpen — who opens what", () => {
  it("opens everything but the admin desk to the cross-section posting", () => {
    expect(opens(department)).toEqual(every.filter((h) => h !== "/admin/users"));
    expect(opens(admin)).toEqual(every);
  });

  it("gives Licensing the register, its reports and its workflow", () => {
    expect(opens(licensing)).toEqual([
      "/",
      "/facilities",
      "/functional-facilities",
      "/reports",
      "/licences",
      "/licence-status",
      "/bulk-approval",
      "/inspection-requests",
      "/daily",
      "/tasks",
      "/weekly",
      "/settings",
    ]);
  });

  it("gives the Inspectorate its database, the register and the handoff", () => {
    expect(opens(inspector)).toEqual([
      "/facilities",
      "/functional-facilities",
      "/inspectorate",
      "/inspection-requests",
      "/daily",
      "/tasks",
      "/weekly",
      "/inspections",
      "/settings",
    ]);
  });

  it("gives NSSS at head office its dashboard and the scan log", () => {
    expect(opens(nsssDesk)).toEqual([
      "/nsss",
      "/border",
      "/daily",
      "/tasks",
      "/weekly",
      "/settings",
    ]);
  });

  it("gives a posted officer the scan log, their desk and nothing else", () => {
    expect(opens(nakonde)).toEqual(["/border", "/tasks"]);
  });

  it("gives the National Source Inventory its two registers", () => {
    expect(opens(nsi)).toEqual([
      "/source-inventory",
      "/verified-source-inventory",
      "/daily",
      "/tasks",
      "/weekly",
      "/settings",
    ]);
  });

  it("covers a screen's sub-paths but not its lookalikes", () => {
    expect(canOpen(inspector, "/facilities/abc-123")).toBe(true);
    expect(canOpen(nsi, "/facilities/abc-123")).toBe(false);
    expect(routeFor("/inspection-requests")?.href).toBe("/inspection-requests");
    expect(routeFor("/inspectionsx")).toBeNull();
    expect(canOpen(admin, "/no-such-screen")).toBe(false);
  });
});

describe("homeFor", () => {
  it("is each section's own front door", () => {
    expect(homeFor(admin)).toBe("/");
    expect(homeFor(licensing)).toBe("/");
    expect(homeFor(inspector)).toBe("/inspectorate");
    expect(homeFor(nsssDesk)).toBe("/nsss");
    expect(homeFor(nakonde)).toBe("/border");
    expect(homeFor(nsi)).toBe("/source-inventory");
  });

  it("is always a screen the account may open", () => {
    for (const u of [admin, department, licensing, inspector, nsssDesk, nakonde, nsi]) {
      expect(canOpen(u, homeFor(u))).toBe(true);
    }
  });
});

describe("navFor", () => {
  it("keeps the sidebar's groups, dropping any left empty", () => {
    expect(navFor(admin).map((g) => g.heading)).toEqual([
      "Register",
      "Sections",
      "Workflow",
    ]);
    expect(navFor(nsi).map((g) => [g.heading, g.items.map((i) => i.href)])).toEqual([
      ["Register", ["/source-inventory", "/verified-source-inventory"]],
      ["Workflow", ["/daily", "/tasks"]],
    ]);
  });

  it("is the scan log and the desk for a posted officer", () => {
    expect(navFor(nakonde)).toEqual([
      { heading: "Sections", items: [ROUTES.find((r) => r.href === "/border")] },
      { heading: "Workflow", items: [ROUTES.find((r) => r.href === "/tasks")] },
    ]);
  });

  it("never lists Settings, the admin desk or link-only screens", () => {
    const hrefs = navFor(admin).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain("/settings");
    expect(hrefs).not.toContain("/admin/users");
    expect(hrefs).not.toContain("/weekly");
    expect(hrefs).not.toContain("/inspections");
  });
});

describe("mobileTabsFor", () => {
  it("keeps the four tabs the department had", () => {
    expect(mobileTabsFor(admin).map((t) => t.href)).toEqual([
      "/",
      "/facilities",
      "/daily",
      "/inspection-requests",
    ]);
  });

  it("gives each section the screens it lives in", () => {
    expect(mobileTabsFor(inspector).map((t) => t.href)).toEqual([
      "/facilities",
      "/daily",
      "/inspection-requests",
      "/inspectorate",
    ]);
    // Tasks fills the fourth slot where a section has one free.
    expect(mobileTabsFor(nsssDesk).map((t) => t.href)).toEqual([
      "/daily",
      "/nsss",
      "/border",
      "/tasks",
    ]);
    expect(mobileTabsFor(nsi).map((t) => t.href)).toEqual([
      "/daily",
      "/source-inventory",
      "/verified-source-inventory",
      "/tasks",
    ]);
  });

  it("shows a posted officer no bar at all", () => {
    expect(mobileTabsFor(nakonde)).toEqual([]);
  });
});
