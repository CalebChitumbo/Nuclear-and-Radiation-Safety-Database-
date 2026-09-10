/**
 * Who sees what.
 *
 * Every account works from one of three places, and that place decides which
 * screens it can open and which section's records it is shown:
 *
 * - **The department** — an administrator, or an account holding the
 *   cross-section "All" posting. Sees everything.
 * - **A section** — an ordinary officer of Authorisation & Standards, the
 *   Inspectorate, Nuclear Safety, Security & Safeguards or the National Source
 *   Inventory. Sees the screens that section works in, and its own rows of the
 *   shared daily and weekly reports.
 * - **An inland office** — an NSSS officer posted to a border post. Their job
 *   is scanning trucks, so they get the Border Scan Log and nothing else: no
 *   register, no licensing, no inspections, no reports. They sign in and they
 *   are on the capture screen.
 *
 * This module is the single statement of that: the route table below is what
 * the sidebar, the phone tab bar and the route guard are all built from, and
 * `firestore.rules` enforces the same partition against the account's claims,
 * so hiding a link is never what actually keeps a record private.
 *
 * Everything here is pure so it can be unit-tested and used from either side of
 * the store.
 */

import { NSSS_SECTION } from "./daily";
import { SECTIONS, type Section, type UserDoc } from "./types";

const AS: Section = "Authorisation & Standards";
const INSP: Section = "Inspectorate";
const NSI: Section = "National Source Inventory";

/** What the access rules need to know about an account. */
export type Viewer = Pick<UserDoc, "role" | "section" | "border"> | null;

/** Where an account works from — see the module note. */
export type Workspace =
  | { kind: "department" }
  | { kind: "section"; section: Section }
  | { kind: "post"; office: string };

/**
 * The workspace an account holds. A posting to an inland office only means
 * anything for an NSSS officer — the sign-up rules never attach one to any
 * other section, and an administrator is never confined by one.
 */
export function workspaceFor(user: Viewer): Workspace | null {
  if (!user) return null;
  if (user.role === "admin" || user.section === "All") {
    return { kind: "department" };
  }
  if (user.section === NSSS_SECTION && user.border) {
    return { kind: "post", office: user.border };
  }
  return { kind: "section", section: user.section };
}

/** An NSSS officer posted to an inland office — the scan-log-only account. */
export function isPostedOfficer(user: Viewer): boolean {
  return workspaceFor(user)?.kind === "post";
}

/**
 * The sections whose records this account is shown: all four for the
 * department, one for a section officer, and NSSS for a posted officer (whose
 * one screen belongs to that section).
 */
export function sectionsFor(user: Viewer): Section[] {
  const ws = workspaceFor(user);
  if (!ws) return [];
  if (ws.kind === "department") return [...SECTIONS];
  if (ws.kind === "post") return [NSSS_SECTION];
  return [ws.section];
}

/**
 * Whether this account works with the facilities register and the records
 * hung off it — licences, inspections, inspection requests, applications.
 * Licensing and the Inspectorate do; the NSSS and NSI sections have their own
 * registers and never need to read it.
 */
export function seesRegister(user: Viewer): boolean {
  const sections = sectionsFor(user);
  return !isPostedOfficer(user) && (sections.includes(AS) || sections.includes(INSP));
}

/**
 * The narrowest daily-log read an account is entitled to: the department reads
 * every entry, a section its own, a posted officer their post's. The store
 * turns this into the query, and the security rules refuse anything wider.
 */
export interface DailyEntryScope {
  section?: Section;
  border?: string;
}

export function dailyEntryScope(user: Viewer): DailyEntryScope | undefined {
  const ws = workspaceFor(user);
  if (!ws || ws.kind === "department") return undefined;
  if (ws.kind === "post") return { section: NSSS_SECTION, border: ws.office };
  return { section: ws.section };
}

// ---------------------------------------------------------------------------
// The route table
// ---------------------------------------------------------------------------

export type NavGroupName = "Register" | "Sections" | "Workflow";

export interface RouteAccess {
  href: string;
  label: string;
  /** Shorter wording for the collapsed sidebar and phone header. */
  short?: string;
  icon: string;
  /** Where the link sits in the sidebar; absent for routes reached by links only. */
  group?: NavGroupName;
  /** The sections whose officers may open it. Administrators may open all. */
  sections: readonly Section[];
  /** Also open to an NSSS officer posted to an inland office. */
  post?: boolean;
  /** Administrators only, whatever the section. */
  admin?: boolean;
}

const ALL_SECTIONS: readonly Section[] = SECTIONS;

/**
 * Every screen in the system and who may open it. Order matters: it is the
 * order the sidebar lists them in.
 */
export const ROUTES: readonly RouteAccess[] = [
  { href: "/", label: "Overview", icon: "▣", group: "Register", sections: [AS] },
  {
    href: "/facilities",
    label: "Facilities",
    icon: "▤",
    group: "Register",
    sections: [AS, INSP],
  },
  {
    href: "/functional-facilities",
    label: "Functional Facilities",
    short: "Functional",
    icon: "◈",
    group: "Register",
    sections: [AS, INSP],
  },
  {
    href: "/source-inventory",
    label: "Source Inventory",
    icon: "⚛",
    group: "Register",
    sections: [NSI],
  },
  {
    href: "/verified-source-inventory",
    label: "Verified Source Inventory",
    short: "Verified Sources",
    icon: "✓",
    group: "Register",
    sections: [NSI],
  },
  { href: "/reports", label: "Reports", icon: "▥", group: "Register", sections: [AS] },
  {
    href: "/licences",
    label: "Authorisations",
    icon: "▦",
    group: "Register",
    sections: [AS],
  },
  {
    href: "/inspectorate",
    label: "Inspectorate",
    icon: "✶",
    group: "Sections",
    sections: [INSP],
  },
  {
    href: "/nsss",
    label: "Nuclear Safety, Security & Safeguards",
    short: "Nuclear Safety (NSSS)",
    icon: "⬢",
    group: "Sections",
    sections: [NSSS_SECTION],
  },
  {
    href: "/border",
    label: "Border Scan Log",
    icon: "☢",
    group: "Sections",
    sections: [NSSS_SECTION],
    post: true,
  },
  {
    href: "/licence-status",
    label: "Smart Status Update",
    icon: "◑",
    group: "Workflow",
    sections: [AS],
  },
  {
    href: "/bulk-approval",
    label: "Bulk Approval",
    icon: "▼",
    group: "Workflow",
    sections: [AS],
  },
  {
    href: "/inspection-requests",
    label: "Inspection Requests",
    icon: "⇄",
    group: "Workflow",
    sections: [AS, INSP],
  },
  {
    href: "/daily",
    label: "Daily Updates",
    icon: "✎",
    group: "Workflow",
    sections: ALL_SECTIONS,
  },
  // Reached from Daily Updates and the Overview rather than the sidebar.
  { href: "/weekly", label: "Sectional Update", icon: "▦", sections: ALL_SECTIONS },
  // The old Inspections tab forwards to the Inspectorate.
  { href: "/inspections", label: "Inspectorate", icon: "✶", sections: [INSP] },
  { href: "/admin/users", label: "Users", icon: "◉", sections: [], admin: true },
  { href: "/settings", label: "Settings", icon: "⚙", sections: ALL_SECTIONS },
];

/** Screens a signed-out, or not-yet-approved, visitor may be on. */
export const PUBLIC_ROUTES = ["/login", "/signup"] as const;
export const PENDING_ROUTE = "/pending";

function matches(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The route table entry a path belongs to, if any. */
export function routeFor(pathname: string): RouteAccess | null {
  let best: RouteAccess | null = null;
  for (const r of ROUTES) {
    if (matches(r.href, pathname) && (!best || r.href.length > best.href.length)) {
      best = r;
    }
  }
  return best;
}

/** May this account open the given route table entry? */
export function mayOpen(user: Viewer, route: RouteAccess): boolean {
  const ws = workspaceFor(user);
  if (!ws) return false;
  if (route.admin) return user?.role === "admin";
  if (ws.kind === "department") return true;
  if (ws.kind === "post") return !!route.post;
  return route.sections.includes(ws.section);
}

/**
 * May this account open the given path? Paths the table does not know are
 * refused: a screen that has not been placed in the partition is not open to
 * anyone, which is the safe default for a route added by mistake.
 */
export function canOpen(user: Viewer, pathname: string): boolean {
  const route = routeFor(pathname);
  return !!route && mayOpen(user, route);
}

/**
 * Where an account lands after signing in, and where it is sent when it asks
 * for a screen it may not open — its own section's front door.
 */
export function homeFor(user: Viewer): string {
  const ws = workspaceFor(user);
  if (!ws) return "/login";
  if (ws.kind === "department") return "/";
  if (ws.kind === "post") return "/border";
  switch (ws.section) {
    case INSP:
      return "/inspectorate";
    case NSSS_SECTION:
      return "/nsss";
    case NSI:
      return "/source-inventory";
    default:
      return "/";
  }
}

export interface NavGroup {
  heading: NavGroupName;
  items: RouteAccess[];
}

/**
 * The sidebar for this account: the route table's groups with only the screens
 * it may open, and groups left out when nothing in them survives. Admin and
 * Settings are not here — the sidebar places those itself.
 */
export function navFor(user: Viewer): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const route of ROUTES) {
    if (!route.group || !mayOpen(user, route)) continue;
    let group = groups.find((g) => g.heading === route.group);
    if (!group) {
      group = { heading: route.group, items: [] };
      groups.push(group);
    }
    group.items.push(route);
  }
  return groups;
}

/** The phone tab bar holds four screens; these are offered in this order. */
const TAB_PREFERENCE: readonly { href: string; label: string }[] = [
  { href: "/", label: "Overview" },
  { href: "/facilities", label: "Register" },
  { href: "/daily", label: "Daily" },
  { href: "/inspection-requests", label: "Requests" },
  { href: "/inspectorate", label: "Inspectorate" },
  { href: "/nsss", label: "NSSS" },
  { href: "/border", label: "Scan log" },
  { href: "/source-inventory", label: "Sources" },
  { href: "/verified-source-inventory", label: "Verified" },
  { href: "/reports", label: "Reports" },
];

export interface MobileTab {
  href: string;
  label: string;
  icon: string;
}

/**
 * The four screens the phone tab bar shows this account — the ones its work
 * lives in, from the preference list above. A posted officer has one screen,
 * so the bar shows none: there is nowhere else to go.
 */
export function mobileTabsFor(user: Viewer): MobileTab[] {
  if (isPostedOfficer(user)) return [];
  const tabs: MobileTab[] = [];
  for (const pref of TAB_PREFERENCE) {
    const route = ROUTES.find((r) => r.href === pref.href);
    if (!route || !mayOpen(user, route)) continue;
    tabs.push({ href: route.href, label: pref.label, icon: route.icon });
    if (tabs.length === 4) break;
  }
  return tabs;
}
