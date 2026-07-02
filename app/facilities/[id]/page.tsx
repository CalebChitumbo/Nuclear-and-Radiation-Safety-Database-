"use client";

import { useRouter } from "next/navigation";

import { FacilityDrawer } from "@/components/FacilityDrawer";

// Next 14 passes `params` to client pages as a plain object (the Promise +
// React.use() convention is Next 15).
export default function FacilityDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();

  return (
    <div>
      <FacilityDrawer
        facilityId={params.id}
        onClose={() => router.push("/facilities")}
      />
    </div>
  );
}
