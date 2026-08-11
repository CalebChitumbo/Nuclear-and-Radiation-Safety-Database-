"use client";

import type { ReactNode } from "react";

/**
 * The segmented filter used across the dashboards. Every page previously
 * hand-rolled this out of an `inline-flex … overflow-hidden` div with inline
 * styles, which forced a fixed-width row that ran off a phone screen. This one
 * wraps.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = "",
}: {
  options: ReadonlyArray<{ value: T; label: ReactNode; disabled?: boolean }>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={`seg ${className}`} role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="seg-btn"
          aria-pressed={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
