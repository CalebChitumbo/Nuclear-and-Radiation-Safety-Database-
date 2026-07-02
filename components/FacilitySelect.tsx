"use client";

import { useMemo } from "react";

import type { Facility } from "@/lib/rules/types";

/**
 * Native select over the FULL register, sorted by name. Replaces the ad-hoc
 * `facilities.slice(0, N)` dropdowns that silently hid every facility past the
 * cap — with 474 register rows, an officer could simply never pick some
 * facilities. A native <option> list at this size is cheap; wrap the consumer
 * row in React.memo if it renders in a long list.
 */
export function FacilitySelect({
  facilities,
  value,
  onChange,
  emptyLabel = "— no match —",
  className = "input",
  ariaLabel = "Match to register facility",
}: {
  facilities: Facility[];
  value: string | null;
  onChange: (facilityId: string | null) => void;
  emptyLabel?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const sorted = useMemo(
    () => [...facilities].sort((a, b) => a.name.localeCompare(b.name)),
    [facilities],
  );
  return (
    <select
      className={className}
      value={value || ""}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{emptyLabel}</option>
      {sorted.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </select>
  );
}
