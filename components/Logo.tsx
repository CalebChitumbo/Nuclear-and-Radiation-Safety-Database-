interface LogoProps {
  size?: number;
  className?: string;
  title?: string;
}

export function Logo({ size = 56, className, title = "RPA" }: LogoProps) {
  return (
    <img
      src="/rpa-logo.png"
      alt={title}
      title={title}
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: "cover",
        borderRadius: "50%",
        display: "block",
        flexShrink: 0,
      }}
    />
  );
}
