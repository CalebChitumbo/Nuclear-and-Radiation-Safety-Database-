import type { ReactNode } from "react";

/**
 * Layout primitives that replace "wrap everything in its own box".
 *
 * A page is a stack of `Panel`s: one white sheet each, with a titled head and
 * content flowing underneath. Related figures and lists live *inside* one
 * panel, separated by hairlines, instead of each getting a card of its own.
 */

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="caps text-[10px] text-gunmetal/55">{eyebrow}</div>
        ) : null}
        <h1 className="text-lg sm:text-2xl font-black tracking-tight leading-tight">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-sm text-gunmetal/60 mt-1 max-w-2xl">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">{actions}</div>
      ) : null}
    </header>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="section-head">
      <h2 className="section-title">{children}</h2>
      {action}
    </div>
  );
}

/**
 * One white sheet. `flush` drops the padding for panels whose body is a table
 * or a divided list that should run edge to edge.
 */
export function Panel({
  title,
  action,
  note,
  children,
  flush,
  className = "",
  bleed = true,
}: {
  title?: ReactNode;
  action?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
  /** Run full-width on phones (default). Turn off inside grids. */
  bleed?: boolean;
}) {
  return (
    <section
      className={`card ${bleed ? "bleed" : ""} ${
        flush ? "py-4 sm:py-5" : "p-4 sm:p-5"
      } ${className}`}
    >
      {title ? (
        <div className={flush ? "px-4 sm:px-5" : ""}>
          <SectionTitle action={action}>{title}</SectionTitle>
          {note ? <p className="section-note">{note}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A label/value pair for record cards — replaces ad-hoc floating text. */
export function Field({
  label,
  value,
  wide,
}: {
  label: string;
  value: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="caps text-[10px] text-gunmetal/55">{label}</dt>
      <dd className="font-bold text-sm mt-0.5 break-words">{value}</dd>
    </div>
  );
}

/** A row in a divided list: label left, figure right. */
export function DataRow({
  label,
  value,
  sub,
  accent,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  accent?: "red" | "green" | "slate";
}) {
  const tone =
    accent === "red"
      ? "text-[var(--status-stalled)]"
      : accent === "green"
        ? "text-[var(--rpa-green-dark)]"
        : accent === "slate"
          ? "text-[var(--status-info)]"
          : "";
  return (
    <li className="flex items-baseline justify-between gap-3 py-2">
      <span className="min-w-0">
        <span className="text-sm">{label}</span>
        {sub ? (
          <span className="block text-xs text-gunmetal/55">{sub}</span>
        ) : null}
      </span>
      <span className={`tabular font-black shrink-0 ${tone}`}>{value}</span>
    </li>
  );
}
