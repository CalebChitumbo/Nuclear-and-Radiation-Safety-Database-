import { Panel } from "./Section";

interface BarRow {
  label: string;
  total: number;
  primary?: number; // optional "licensed of total" overlay
}

interface Props {
  title: string;
  rows: BarRow[];
  max?: number;
  showCounts?: boolean;
  /** Render just the bars, for use inside a panel that already has a heading. */
  bare?: boolean;
}

export function Bars({ title, rows, max, showCounts = true, bare }: Props) {
  const localMax =
    max ?? Math.max(1, ...rows.map((r) => Math.max(r.total, r.primary || 0)));

  const body = (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const pctTotal = (r.total / localMax) * 100;
        const pctPrimary = r.primary ? (r.primary / localMax) * 100 : 0;
        return (
          <div key={r.label} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-bold min-w-0 break-words">{r.label}</span>
              {showCounts ? (
                <span className="tabular text-gunmetal/70 shrink-0">
                  {r.primary !== undefined ? (
                    <>
                      <span className="text-[var(--rpa-green-dark)] font-bold">
                        {r.primary}
                      </span>
                      <span className="text-gunmetal/40 mx-1">/</span>
                    </>
                  ) : null}
                  <span>{r.total}</span>
                </span>
              ) : null}
            </div>
            <div
              className="relative h-1.5 mt-1.5 rounded-full overflow-hidden"
              style={{ background: "rgba(26,27,29,0.07)" }}
              role="img"
              aria-label={
                r.primary !== undefined
                  ? `${r.label}: ${r.primary} of ${r.total}`
                  : `${r.label}: ${r.total}`
              }
            >
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  width: `${pctTotal}%`,
                  background: "rgba(26,27,29,0.2)",
                }}
              />
              {r.primary !== undefined ? (
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${pctPrimary}%`,
                    background: "var(--rpa-green)",
                  }}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );

  if (bare) return body;
  return <Panel title={title}>{body}</Panel>;
}
