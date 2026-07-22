"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * The standalone Inspections tab moved into the Inspectorate tab, which now
 * carries the section's full dashboard (per-type statistics, schedule,
 * enforcement actions) alongside the log and register this page used to hold.
 * Old links and bookmarks land here, so forward them.
 */
export default function InspectionsMovedPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/inspectorate");
  }, [router]);
  return (
    <div className="caps text-xs text-gunmetal/60">
      Inspections now live on the{" "}
      <Link className="underline" href="/inspectorate">
        Inspectorate
      </Link>{" "}
      tab…
    </div>
  );
}
