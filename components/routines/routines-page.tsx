"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { RoutinesPanel } from "@/components/routines/routines-panel";
import { usePublishCurrentView } from "@/lib/current-view-context";

/** The global routines page, independent of the conversations page. */
export function RoutinesPage() {
  const t = useTranslations("Routines");
  const router = useRouter();
  const searchParams = useSearchParams();
  const routineParam = searchParams.get("routine");
  const [selectedId, setSelectedId] = useState<string | null>(routineParam);
  const [mobileDetail, setMobileDetail] = useState(Boolean(routineParam));

  useEffect(() => {
    setSelectedId(routineParam);
    setMobileDetail(Boolean(routineParam));
  }, [routineParam]);

  const selectRoutine = (id: string | null) => {
    setSelectedId(id);
    setMobileDetail(Boolean(id));
    router.replace(id ? `/routines?routine=${encodeURIComponent(id)}` : "/routines");
  };

  usePublishCurrentView({
    href: selectedId
      ? `/routines?routine=${encodeURIComponent(selectedId)}`
      : "/routines",
    label: t("tab"),
  });

  return (
    <div className="flex h-full min-h-0">
      <RoutinesPanel
        selectedId={selectedId}
        onSelect={selectRoutine}
        mobileDetail={mobileDetail}
        onBack={() => {
          setMobileDetail(false);
          router.replace("/routines");
        }}
      />
    </div>
  );
}
