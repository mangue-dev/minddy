"use client";

import { useEffect, useState } from "react";
import { AppTabRouteBoundary, useAppTabActive, useAppTabRoute } from "@/lib/app-tab-route-context";
import { useOptionalAppTabNavigation } from "@/lib/app-tab-navigation-context";
import { useTranslations } from "next-intl";

import { RoutinesPanel } from "@/components/routines/routines-panel";
import { usePublishCurrentView } from "@/lib/current-view-context";

/** The global routines page, independent of the conversations page. */
export function RoutinesPage() {
  return <AppTabRouteBoundary><RoutinesPageInner /></AppTabRouteBoundary>;
}

function RoutinesPageInner() {
  const t = useTranslations("Routines");
  const { pathname, searchParams } = useAppTabRoute();
  const active = useAppTabActive();
  const navigation = useOptionalAppTabNavigation();
  const routineParam = searchParams.get("routine");
  const [selectedId, setSelectedId] = useState<string | null>(routineParam);

  useEffect(() => {
    setSelectedId(routineParam);
  }, [routineParam]);

  const selectRoutine = (id: string | null) => {
    setSelectedId(id);
    // Selection changes stay within this surface and require no server route.
    // An asynchronous callback from a hidden tab must not change another tab's URL.
    if (active && window.location.pathname === pathname &&
        (!navigation || navigation.session.getSnapshot().activeId === navigation.activeId)) {
      window.history.replaceState(null, "", id ? `/routines?routine=${encodeURIComponent(id)}` : "/routines");
    }
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
      />
    </div>
  );
}
