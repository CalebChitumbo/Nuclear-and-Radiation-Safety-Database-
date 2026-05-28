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
}

export function Bars({ title, rows, max, showCounts = true }: Props) {
  const localMax =
    max ?? Math.max(1, ...rows.map((r) => Math.max(r.total, r.primary || 0)));
  return (
    <div className="card p-5">
      <div className="caps text-xs text-gunmetal/60 mb-3">{title}</div>
      <div className="space-y-2">
        {rows.map((r) => {
          const pctTotal = (r.total / localMax) * 100;
          const pctPrimary = r.primary ? (r.primary / localMax) * 100 : 0;
          return (
            <div key={r.label} className="text-sm">
              <div className="flex items-baseline justify-between">
                <span className="font-bold">{r.label}</span>
                {showCounts ? (
                  <span className="tabular text-gunmetal/70">
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
                className="relative h-2 mt-1 rounded-full overflow-hidden"
                style={{ background: "rgba(26,27,29,0.06)" }}
              >
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${pctTotal}%`,
                    background: "rgba(26,27,29,0.22)",
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
    </div>
  );
}
