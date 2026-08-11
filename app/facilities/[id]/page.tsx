"use client";

import { FacilityDetail } from "@/components/facility/FacilityDetail";

// Next 14 passes `params` to client pages as a plain object (the Promise +
// React.use() convention is Next 15).
export default function FacilityDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <div className="staggered">
      <FacilityDetail facilityId={params.id} variant="page" />
    </div>
  );
}
