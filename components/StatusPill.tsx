import type { Stage } from "@/lib/rules/types";

interface Props {
  licensed: boolean;
  stage?: Stage;
  className?: string;
}

export function StatusPill({ licensed, stage, className = "" }: Props) {
  if (licensed) {
    return (
      <span className={`chip green ${className}`}>
        <Dot color="#00A050" />
        Licensed
      </span>
    );
  }
  if (stage === "Import Licence Only (Not yet Use/Possession)") {
    return (
      <span className={`chip slate ${className}`}>
        <Dot color="#2C5D7A" />
        Import only
      </span>
    );
  }
  if (stage && stage !== "No Application Submitted") {
    return (
      <span className={`chip amber ${className}`}>
        <Dot color="#B8860B" />
        In progress
      </span>
    );
  }
  return (
    <span className={`chip red ${className}`}>
      <Dot color="#A8362B" />
      No application
    </span>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: 999,
        background: color,
        display: "inline-block",
      }}
    />
  );
}
