import type { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  accent?: "green" | "yellow" | "slate" | "amber" | "red" | "neutral";
}

const accentStyle: Record<NonNullable<Props["accent"]>, string> = {
  green: "text-[var(--rpa-green-dark)]",
  yellow: "text-[var(--gunmetal)]",
  slate: "text-[var(--status-info)]",
  amber: "text-[#7a5b07]",
  red: "text-[var(--status-stalled)]",
  neutral: "text-[var(--gunmetal)]",
};

/**
 * A single figure in a stat strip. Wrap a row of these in `.stat-grid` — the
 * strip is one sheet divided by hairlines, rather than a row of floating cards.
 */
export function Kpi({ label, value, caption, accent = "neutral" }: Props) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${accentStyle[accent]}`}>{value}</div>
      {caption ? <div className="stat-caption">{caption}</div> : null}
    </div>
  );
}
