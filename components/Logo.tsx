interface LogoProps {
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Inline SVG version of the RPA mark — atom orbits, Zambia map silhouette, "RPA"
 * lockup. Used everywhere so we don't depend on an external PNG that may not be
 * present in the demo environment. The PNG in /public/rpa-logo.png is still
 * served as the canonical favicon-source asset.
 */
export function Logo({ size = 56, className, title = "RPA" }: LogoProps) {
  return (
    <svg
      role="img"
      aria-label={title}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
    >
      <title>{title}</title>
      {/* yellow petals (atom orbits) */}
      <g fill="#F0F000" stroke="#1A1B1D" strokeWidth="2">
        <ellipse cx="100" cy="100" rx="92" ry="34" />
        <ellipse
          cx="100"
          cy="100"
          rx="92"
          ry="34"
          transform="rotate(60 100 100)"
        />
        <ellipse
          cx="100"
          cy="100"
          rx="92"
          ry="34"
          transform="rotate(120 100 100)"
        />
      </g>
      {/* dots */}
      <g fill="#1A1B1D">
        <circle cx="100" cy="20" r="8" />
        <circle cx="180" cy="140" r="8" />
        <circle cx="20" cy="140" r="8" />
      </g>
      {/* Zambia map (stylised) */}
      <path
        d="M62 64 L138 60 L154 84 L142 116 L150 138 L120 144 L102 132 L78 138 L62 118 L70 92 Z"
        fill="#00A050"
        stroke="#1A1B1D"
        strokeWidth="2"
      />
      {/* RPA */}
      <text
        x="100"
        y="112"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="900"
        fontSize="28"
        fill="#FFFFFF"
      >
        RPA
      </text>
    </svg>
  );
}
