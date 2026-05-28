"use client";

import { useRouter } from "next/navigation";
import { use } from "react";

import { FacilityDrawer } from "@/components/FacilityDrawer";

export default function FacilityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  return (
    <div>
      <FacilityDrawer
        facilityId={id}
        onClose={() => router.push("/facilities")}
      />
    </div>
  );
}
