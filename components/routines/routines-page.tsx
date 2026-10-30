"use client";

import { expandParam } from "@/lib/ref-registry";
import { routineHref } from "@/lib/app-urls";
import { useEffect, useState } from "react";
import { AppTabRouteBoundary, useAppTabActive, useAppTabRoute } from "@/lib/app-tab-route-context";
import { useOptionalAppTabNavigation } from "@/lib/app-tab-navigation-context";

import { RoutinesPanel } from "@/components/routines/routines-panel";
import type { RoutineDetailIntent } from "@/components/routines/routine-detail";
import { usePublishCurrentView } from "@/lib/current-view-context";

/** The global routines page, independent of the conversations page. */
export function RoutinesPage() {
  return <AppTabRouteBoundary><RoutinesPageInner /></AppTabRouteBoundary>;
}

function RoutinesPageInner() {
  const { pathname, searchParams } = useAppTabRoute();
  const active = useAppTabActive();
  const navigation = useOptionalAppTabNavigation();
  const routineParam = expandParam(searchParams.get("routine"));
  const actionParam = searchParams.get("action");
  const [selectedId, setSelectedId] = useState<string | null>(routineParam);
  // `?action=` comes from the sidebar menu (MIN-685) and targets the routine
  // of the same URL. It is held here until the pane has handled it once.
  const [intent, setIntent] = useState<{ routineId: string; action: RoutineDetailIntent } | null>(null);

  useEffect(() => {
    setSelectedId(routineParam);
  }, [routineParam]);
  // `?new=1` comes from the Routines row's "New routine" entry.
  const [createIntent, setCreateIntent] = useState(false);
  const newParam = searchParams.get("new");
  useEffect(() => {
    if (active && newParam === "1") setCreateIntent(true);
  }, [active, newParam]);
  const consumeCreateIntent = () => {
    setCreateIntent(false);
    writeSelection(selectedId);
  };
  useEffect(() => {
    if (!active || !routineParam) return;
    if (actionParam === "edit" || actionParam === "latest-run")
      setIntent({ routineId: routineParam, action: actionParam });
  }, [active, routineParam, actionParam]);

  const writeSelection = (id: string | null) => {
    // Selection changes stay within this surface and require no server route.
    // An asynchronous callback from a hidden tab must not change another tab's URL.
    if (active && window.location.pathname === pathname &&
        (!navigation || navigation.session.getSnapshot().activeId === navigation.activeId)) {
      window.history.replaceState(null, "", id ? routineHref(id) : "/routines");
    }
  };
  const selectRoutine = (id: string | null) => {
    setSelectedId(id);
    if (intent && intent.routineId !== id) setIntent(null);
    writeSelection(id);
  };
  const requestIntent = (routineId: string, action: RoutineDetailIntent) => {
    setSelectedId(routineId);
    setIntent({ routineId, action });
    writeSelection(routineId);
  };
  const consumeIntent = () => {
    setIntent(null);
    writeSelection(selectedId);
  };

  usePublishCurrentView({
    href: selectedId
      ? routineHref(selectedId)
      : "/routines",
  });

  return (
    <div className="flex h-full min-h-0">
      <RoutinesPanel
        selectedId={selectedId}
        onSelect={selectRoutine}
        intent={intent && intent.routineId === selectedId ? intent.action : null}
        onIntentConsumed={consumeIntent}
        onIntent={requestIntent}
        createIntent={createIntent}
        onCreateIntentConsumed={consumeCreateIntent}
      />
    </div>
  );
}
