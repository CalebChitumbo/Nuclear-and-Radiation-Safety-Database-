"use client";

import { usePathname } from "next/navigation";

import { useWeek } from "@/lib/weekContext";

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/facilities": "Facilities Register",
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
  "/weekly": "Weekly Sectional Report",
  "/admin/users": "User Management",
  "/settings": "Settings",
};

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();
  const { weeks, selected, setSelected } = useWeek();

  let title = "Overview";
  for (const key of Object.keys(TITLES)) {
    if (key === "/" ? pathname === "/" : pathname.startsWith(key)) {
      title = TITLES[key];
    }
  }

  return (
    <header
      className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-white/95 backdrop-blur border-b"
      style={{ borderColor: "rgba(26,27,29,0.08)" }}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden btn btn-ghost px-2.5 py-2 text-lg leading-none"
          aria-label="Open navigation menu"
        >
          ☰
        </button>
        <div className="min-w-0">
          <h1 className="text-base sm:text-xl font-black tracking-tight truncate">
            {title}
          </h1>
          <div className="caps text-[10px] text-gunmetal/55 truncate hidden sm:block">
            Radiation Protection Authority of Zambia
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <label className="text-xs caps text-gunmetal/60 hidden md:block">
          Reporting week
        </label>
        {/* Width is set on the wrapper so it overrides the full-width `.input`
            rule cleanly without an !important fight. */}
        <div className="w-[150px] sm:w-[240px]">
          <select
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
      </div>
    </header>
  );
}
