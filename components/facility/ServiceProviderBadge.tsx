import { isRecognisedProvider } from "@/lib/rules/serviceProviders";
import type { Facility } from "@/lib/rules/types";

/**
 * The service-provider mark on a facility: a green ★ stamp for one the
 * Authority has recognised, a plain chip for one not yet recognised. Nothing
 * for a facility that is not a service provider.
 */
export function ServiceProviderBadge({
  f,
  small,
}: {
  f: Pick<
    Facility,
    "serviceProvider" | "spRecognised" | "spRecognisedOn" | "spRecognitionNote"
  >;
  small?: boolean;
}) {
  if (!f.serviceProvider) return null;
  const size = small ? "text-[10px]" : "";
  if (isRecognisedProvider(f)) {
    const title = [
      "Service provider recognised by the Authority",
      f.spRecognisedOn ? `on ${f.spRecognisedOn}` : "",
      f.spRecognitionNote ? `— ${f.spRecognitionNote}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <span
        className={`chip green font-black ${size}`}
        title={title}
        aria-label={title}
        style={{ boxShadow: "inset 0 0 0 1.5px var(--rpa-green-dark)" }}
      >
        <span aria-hidden="true">★</span> Recognised service provider
      </span>
    );
  }
  return (
    <span
      className={`chip slate ${size}`}
      title="Service provider — not yet recognised by the Authority"
    >
      Service provider · not yet recognised
    </span>
  );
}
