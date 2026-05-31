"use client";

import { usePathname } from "next/navigation";

import { useWeek } from "@/lib/weekContext";

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/facilities": "Facilities Register",
  "/licence-status": "Licensing Status",
  "/bulk-approval": "Bulk Approval",
  "/inspections": "Inspections",
  "/weekly": "Weekly Sectional Report",
  "/admin/users": "User Management",
  "/settings": "Settings",
};

export function Topbar() {
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
      className="no-print sticky top-0 z-20 flex items-center justify-between px-6 py-3 bg-white/95 backdrop-blur border-b"
      style={{ borderColor: "rgba(26,27,29,0.08)" }}
    >
      <div>
        <h1 className="text-xl font-black tracking-tight">{title}</h1>
        <div className="caps text-[10px] text-gunmetal/55">
          Radiation Protection Authority of Zambia
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label className="text-xs caps text-gunmetal/60">Reporting week</label>
        <select
          value={selected.label}
          onChange={(e) => {
            const next = weeks.find((w) => w.label === e.target.value);
            if (next) setSelected(next);
          }}
          className="input"
          style={{ minWidth: 240 }}
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
