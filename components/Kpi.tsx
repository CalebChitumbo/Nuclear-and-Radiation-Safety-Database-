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

export function Kpi({ label, value, caption, accent = "neutral" }: Props) {
  return (
    <div className="card p-5">
      <div className="caps text-xs text-gunmetal/60">{label}</div>
      <div
        className={`mt-2 text-4xl font-black tabular ${accentStyle[accent]}`}
        style={accent === "yellow" ? { textShadow: "0 1px 0 #F0F000" } : undefined}
      >
        {value}
      </div>
      {caption ? (
        <div className="mt-1 text-sm text-gunmetal/70">{caption}</div>
      ) : null}
    </div>
  );
}
