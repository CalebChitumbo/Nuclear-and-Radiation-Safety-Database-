"use client";

import type { ReactNode } from "react";

/** Number cell that shows blank for 0 (spreadsheet feel) and emits a number. */
export function NumInput({
  value,
  onChange,
  className = "",
  placeholder = "",
  align = "right",
  disabled = false,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
  align?: "left" | "right" | "center";
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      disabled={disabled}
      className={`input tabular ${className}`}
      style={{ textAlign: align }}
      placeholder={placeholder}
      value={value ? String(value) : ""}
      onChange={(e) =>
        onChange(e.target.value === "" ? 0 : Number(e.target.value))
      }
    />
  );
}

export function TextInput({
  value,
  onChange,
  className = "",
  placeholder = "",
  disabled = false,
}: {
  value: string;
  onChange: (s: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      disabled={disabled}
      className={`input ${className}`}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  className?: string;
}) {
  return (
    <select
      className={`input ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Labeled({
  label,
  children,
  hint,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="caps text-[10px] text-gunmetal/60">{label}</label>
      <div className="mt-1">{children}</div>
      {hint ? <div className="text-[11px] text-gunmetal/55 mt-1">{hint}</div> : null}
    </div>
  );
}

/** Small round delete button used at the end of editable rows. */
export function RemoveBtn({ onClick, title = "Remove" }: { onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="no-print text-gunmetal/40 hover:text-[color:var(--status-stalled)] text-lg leading-none px-1"
    >
      ×
    </button>
  );
}

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button
      type="button"
      className="no-print btn btn-secondary"
      onClick={() => window.print()}
    >
      ⎙ {label}
    </button>
  );
}

/** A bordered, print-friendly sheet wrapper for the paper-style forms. */
export function Sheet({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`payroll-sheet card p-6 ${className}`}>{children}</div>;
}

export function Loading() {
  return (
    <div className="card p-6 text-sm text-gunmetal/55">Loading payroll…</div>
  );
}

/** Dotted signature/blank line used across the printable forms. */
export function DottedLine({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`text-sm ${className}`}>
      <span className="font-bold">{label}</span>
      <span className="text-gunmetal/40">
        {" "}
        ……………………………………………………………
      </span>
    </div>
  );
}
