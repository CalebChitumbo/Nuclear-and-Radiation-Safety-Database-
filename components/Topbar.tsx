"use client";

import { usePathname } from "next/navigation";

import { useWeek } from "@/lib/weekContext";

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/facilities": "Facilities Register",
  "/source-inventory": "Source Inventory",
  "/verified-source-inventory": "Verified Source Inventory",
  "/reports": "Register Reports",
  "/licences": "Authorisations",
  "/licence-status": "Smart Status Update",
  "/bulk-approval": "Bulk Approval",
  "/inspection-requests": "Inspection Requests",
  "/inspectorate": "Inspectorate",
  "/inspections": "Inspectorate",
  "/nsss": "Nuclear Safety, Security & Safeguards",
  "/border": "Border Scan Log",
  "/daily": "Daily Updates",
  "/weekly": "Sectional Update — 2026 Work Plan",
  "/admin/users": "User Management",
  "/settings": "Settings",
};

/** Short forms so the long section names still fit a phone header. */
const SHORT_TITLES: Record<string, string> = {
  "/nsss": "Nuclear Safety (NSSS)",
  "/facilities": "Facilities",
  "/source-inventory": "Sources",
  "/verified-source-inventory": "Verified Sources",
  "/reports": "Reports",
  "/inspection-requests": "Requests",
  "/weekly": "Sectional Update",
  "/admin/users": "Users",
};

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();
  const { weeks, selected, setSelected } = useWeek();

  let matched = "/";
  for (const key of Object.keys(TITLES)) {
    if (key === "/" ? pathname === "/" : pathname.startsWith(key)) {
      matched = key;
    }
  }
  const title = TITLES[matched] || "Overview";
  const shortTitle = SHORT_TITLES[matched] || title;

  return (
    <header
      className="no-print sticky top-0 z-30 flex items-center gap-2 sm:gap-4 px-3 sm:px-6 py-2.5 bg-white/90 backdrop-blur border-b"
      style={{ borderColor: "var(--line)" }}
    >
      <button
        type="button"
        onClick={onMenuClick}
        className="lg:hidden btn btn-ghost px-2.5 text-lg leading-none shrink-0"
        aria-label="Open navigation menu"
      >
        ☰
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="text-base sm:text-xl font-black tracking-tight truncate">
          <span className="sm:hidden">{shortTitle}</span>
          <span className="hidden sm:inline">{title}</span>
        </h1>
        <div className="caps text-[10px] text-gunmetal/50 truncate hidden md:block">
          Radiation Protection Authority of Zambia
        </div>
      </div>

      <label
        className="caps text-[10px] text-gunmetal/55 hidden lg:block shrink-0"
        htmlFor="reporting-week"
      >
        Reporting week
      </label>
      {/* Width lives on the wrapper so it overrides the full-width `.input`
          rule cleanly without an !important fight. */}
      <div className="w-[112px] sm:w-[200px] shrink-0">
        <select
          id="reporting-week"
          value={selected.label}
          onChange={(e) => {
            const next = weeks.find((w) => w.label === e.target.value);
            if (next) setSelected(next);
          }}
          className="input"
          aria-label="Reporting week"
        >
          {weeks.map((w) => (
            <option key={w.label} value={w.label}>
              {w.label}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}
