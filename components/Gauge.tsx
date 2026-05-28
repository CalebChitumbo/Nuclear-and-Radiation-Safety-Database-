interface Props {
  value: number; // 0..100
  label?: string;
  size?: number;
}

export function Gauge({ value, label = "Licensing coverage", size = 180 }: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - 18) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  return (
    <div className="card p-5 flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(26,27,29,0.08)"
          strokeWidth={14}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#00A050"
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          dy="-2"
          textAnchor="middle"
          fontWeight="900"
          fontSize="34"
          fill="#1A1B1D"
        >
          {clamped.toFixed(1)}%
        </text>
        <text
          x="50%"
          y="50%"
          dy="22"
          textAnchor="middle"
          fontSize="11"
          fill="#1A1B1D"
          className="caps"
        >
          Licensed
        </text>
      </svg>
      <div className="caps text-xs text-gunmetal/60 mt-2">{label}</div>
    </div>
  );
}
