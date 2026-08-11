"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { Drawer } from "./Drawer";
import { FacilityDetail } from "./facility/FacilityDetail";
import type { Facility } from "@/lib/rules/types";

interface Props {
  facilityId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}

/**
 * The register's slide-in facility view. It shows the same content as the
 * facility's permalink page — see `FacilityDetail` — stacked in one column.
 */
export function FacilityDrawer({ facilityId, onClose, onChanged }: Props) {
  const [facility, setFacility] = useState<Facility | null>(null);

  // Clear the previous facility's name the moment another row is opened, so
  // the header never captions the wrong record while the next one loads.
  useEffect(() => {
    setFacility(null);
  }, [facilityId]);

  if (!facilityId) return null;

  return (
    <Drawer
      open
      onClose={onClose}
      title={facility ? facility.name : "Facility"}
      subtitle={
        facility ? (
          <Link href={`/facilities/${facilityId}`} className="link-action">
            Open full page →
          </Link>
        ) : null
      }
    >
      <FacilityDetail
        facilityId={facilityId}
        variant="drawer"
        onChanged={onChanged}
        onLoaded={setFacility}
      />
    </Drawer>
  );
}
