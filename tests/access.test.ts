import { describe, expect, it } from "vitest";

import {
  ROUTES,
  canOpen,
  dailyEntryScope,
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
    });
    expect(workspaceFor(nsssDesk)).toEqual({ kind: "section", section: NSSS });
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
    expect(workspaceFor(odd)).toEqual({ kind: "section", section: "Inspectorate" });
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

describe("dailyEntryScope", () => {
  it("reads the whole log for the department, a section's for a section, a post's for a post", () => {
    expect(dailyEntryScope(admin)).toBeUndefined();
    expect(dailyEntryScope(nsi)).toEqual({ section: "National Source Inventory" });
    expect(dailyEntryScope(nakonde)).toEqual({ section: NSSS, border: "Nakonde" });
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
      "/weekly",
      "/settings",
    ]);
  });

  it("gives a posted officer the scan log and nothing else", () => {
    expect(opens(nakonde)).toEqual(["/border"]);
  });

  it("gives the National Source Inventory its two registers", () => {
    expect(opens(nsi)).toEqual([
      "/source-inventory",
      "/verified-source-inventory",
      "/daily",
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
      ["Workflow", ["/daily"]],
    ]);
  });

  it("is one link for a posted officer", () => {
    expect(navFor(nakonde)).toEqual([
      { heading: "Sections", items: [ROUTES.find((r) => r.href === "/border")] },
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
    expect(mobileTabsFor(nsssDesk).map((t) => t.href)).toEqual([
      "/daily",
      "/nsss",
      "/border",
    ]);
    expect(mobileTabsFor(nsi).map((t) => t.href)).toEqual([
      "/daily",
      "/source-inventory",
      "/verified-source-inventory",
    ]);
  });

  it("shows a posted officer no bar at all", () => {
    expect(mobileTabsFor(nakonde)).toEqual([]);
  });
});
