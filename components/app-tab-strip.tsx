"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Ellipsis, Loader2, AlertCircle, Home, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Input,
} from "mangue-ui";
import { useAppTabs } from "@/lib/app-tabs-context";
import { useProjects } from "@/lib/projects-context";
import { appTabRoute } from "@/lib/app-tab-location";
import { APP_TAB_MAX_NAME, type AppTab } from "@/lib/app-tabs";
import {
  useAgentSessionsQuery,
  useOpenPullRequestCountQuery,
} from "@/lib/use-agent-runs";
import { isAgentSessionUnread } from "@/lib/agent-api";
import { useAgentReads } from "@/lib/use-agent-reads";
import { usePlanGates } from "@/lib/use-billing-query";
import { useAppTabMetadata } from "@/lib/use-app-tab-metadata";
import { AppTabIcon } from "./app-tab-icon";
import { AppTabItem } from "./app-tab-item";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import type { MessageKey } from "@/lib/i18n-keys";

const routeLabels: Record<string, MessageKey<"Nav">> = {
  home: "home", all: "allIssues", inbox: "inbox", routines: "routines",
  "pull-requests": "pullRequests", statistics: "statistics", trash: "trash", settings: "settings", billing: "billing",
  admin: "adminDashboard", pages: "pages", tickets: "tickets", objectives: "objectives", feedback: "feedback", triage: "triage",
};

const restrictToHorizontalAxis: Modifier = ({ transform }) => ({ ...transform, y: 0 });
const horizontalDragModifiers = [restrictToHorizontalAxis];

/** Right padding of the strip's outer container (`pr-2`) — never tab room. */
const RAIL_PAD_RIGHT = 8;
/** Slack the tab fit always keeps free before the "more tabs" menu takes over. */
const RAIL_MARGIN = 16;

export function AppTabStrip({ onNewTab, onNewTabWarm }: { onNewTab: () => void; onNewTabWarm?: () => void }) {
  const { tabs, activeId, session, busy, error, loading, loadError, reload } = useAppTabs();
  const { projects } = useProjects();
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const t = useTranslations("AppTabs");
  const nav = useTranslations("Nav");
  const common = useTranslations("Common");
  const tFamily = useTranslations("IssueFamily");
  const hrefs = tabs.map((tab) => tab.id === activeId ? session.getActiveHref() ?? tab.href : tab.href);
  const { pageById, objectiveById, prById, routineById, issueById } = useAppTabMetadata(hrefs);

  // Notification badges on the tabs follow the same rules as the sidebar (same
  // counters, same caching): open PRs on the PR tab, working/unread marks on
  // the Agents/Numo tab. They sit ON the tab icon's top-right corner, drawn
  // plain — no pill, no ring — as if laid directly over the icon.
  const openPrCount = useOpenPullRequestCountQuery();
  const { agentsAllowed } = usePlanGates();
  const { sessions: agentSessions } = useAgentSessionsQuery();
  const { reads: agentReads } = useAgentReads();
  const anyAgentWorking = agentSessions.some((sessionItem) => sessionItem.working);
  const anyAgentAwaiting = agentSessions.some(
    (sessionItem) => sessionItem.awaitingInput && isAgentSessionUnread(sessionItem, agentReads),
  );
  const anyAgentUnread = agentSessions.some((sessionItem) => isAgentSessionUnread(sessionItem, agentReads));
  const sectionBadges = (section: string): ReactNode => {
    if (section === "pull-requests") {
      if (!agentsAllowed || openPrCount <= 0) return null;
      // Smaller than the sidebar sticker: the tab icon badge reads as a dot
      // of digits; the tab paints its own background around it.
      return (
        <span
          aria-label={nav("pullRequestsBadge", { count: openPrCount })}
          className="px-1 text-[9px] font-medium leading-3 tabular-nums text-muted-foreground"
        >
          {openPrCount > 99 ? "99+" : openPrCount}
        </span>
      );
    }
    if (!agentsAllowed || (section !== "numo" && section !== "agents")) return null;
    if (anyAgentWorking) return <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />;
    if (anyAgentAwaiting) return <span className="size-2 shrink-0 rounded-full bg-yellow-500" aria-label={nav("agentsAwaiting")} />;
    if (anyAgentUnread) return <span className="size-2 shrink-0 rounded-full bg-blue-500" aria-label={nav("agentsUnread")} />;
    return null;
  };

  const strip = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }));
  const [dragged, setDragged] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<AppTab | null>(null);
  const [name, setName] = useState("");
  // The strip never scrolls: tabs shrink, and the tail hides behind the
  // "more tabs" menu. This is the width the whole strip may occupy, measured
  // on the OUTER container (flex-1 min-w-0 — its width does not depend on
  // content); the rail itself is content-sized, capped so the trailing
  // button stays visible right after the last tab. The content box is what
  // counts: the container's own right padding must not pass for room the
  // tabs may occupy — counting it made the row overflow and clipped the
  // trailing buttons instead of yielding them to the "more tabs" menu.
  const [available, setAvailable] = useState(0);
  useEffect(() => {
    const rail = strip.current;
    if (!rail) return;
    const measure = (entries: ResizeObserverEntry[]) => setAvailable(entries[0].contentRect.width);
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    setAvailable(rail.clientWidth - RAIL_PAD_RIGHT);
    return () => observer.disconnect();
  }, []);
  const focusId = focused && tabs.some((tab) => tab.id === focused) ? focused : activeId;
  const close = (id: string) => {
    void session.close(id).then(() => {
      const active = session.getSnapshot().activeId;
      strip.current?.querySelector<HTMLElement>(`[data-app-tab-id="${active}"]`)?.focus();
    });
  };
  const errorKey = error === "save_failed" ? "saveFailed" : error === "conflict" ? "conflict" : error === "last_tab" ? "lastTab" : error === "destination_unavailable" ? "destinationUnavailable" : "syncFailed";
  const collisionDetection: CollisionDetection = (args) => {
    const source = tabs.find((tab) => tab.id === String(args.active.id));
    if (!source) return [];
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((container) =>
        tabs.some((tab) => tab.id === String(container.id) && tab.pinned === source.pinned)
      ),
    });
  };
  const finishDrag = (event: DragEndEvent) => {
    setDragged(null);
    const active = String(event.active.id);
    const over = event.over ? String(event.over.id) : null;
    if (!over || active === over) return;
    const source = tabs.find((tab) => tab.id === active);
    const target = tabs.find((tab) => tab.id === over);
    if (!source || !target || source.pinned !== target.pinned) return;
    const group = tabs.filter((tab) => tab.pinned === source.pinned);
    const from = group.findIndex((tab) => tab.id === active);
    const to = group.findIndex((tab) => tab.id === over);
    const reordered = arrayMove(group, from, to);
    void session.move(active, reordered[to + 1]?.id ?? null);
  };
  const draggedTab = dragged ? tabs.find((tab) => tab.id === dragged) : undefined;
  const describe = (tab: AppTab) => {
    const route = appTabRoute(tab.id === activeId ? session.getActiveHref() ?? tab.href : tab.href);
    const { section, projectId, objectiveId, familyId, view: viewParam, prId, routineId } = route;
    const pageId = route.pageId;
    const project = projectId ? projectById.get(projectId) : undefined;
    const objective = objectiveId ? objectiveById.get(objectiveId) : undefined;
    const page = pageId ? pageById.get(pageId) : undefined;
    const prRef = prId ? prById.get(prId) : undefined;
    const routine = routineId ? routineById.get(routineId) : undefined;
    const familyParent = familyId ? issueById.get(familyId) : undefined;
    const sectionLabel = nav(routeLabels[section] ?? "home");
    // The tab names its CONTENT first: a pinned page, a selected PR or
    // routine reads by itself; without one, the section-project pair stands.
    const contentLabel = page?.title || (prRef ? `#${prRef.number}${prRef.title ? ` ${prRef.title}` : ""}` : null) || routine?.title || null;
    // A board scoped to one issue family names its parent (with the project,
    // like every project tab); the cycle mode of the global board is its own
    // screen, not "All issues".
    const scopeLabel = familyParent
      ? `${tFamily("tabTitle", { parent: familyParent.title })} - ${project?.name ?? t("unavailableProject")}`
      : viewParam === "cycle"
        ? t("cycleTab")
        : null;
    const label = tab.custom_name ?? (objective?.name ?? (contentLabel ?? (scopeLabel ?? (projectId ? `${sectionLabel} - ${project?.name ?? t("unavailableProject")}` : sectionLabel))));
    // EXPERIMENT (to revert): composite = project orb + screen icon.
    const composite = Boolean(projectId && project);
    const pageIcon = page?.icon;
    return { section, projectId, project, objectiveId, objective, familyId, pageIcon, composite, label };
  };
  // Which tabs stay on the rail and how wide the regular ones get: they all
  // shrink to a shared width while that fits, then the tail collapses to its
  // minimum and hides behind the "more tabs" menu. Pinned tabs keep their
  // exact size. Unmeasured rail (first paint) → everything visible.
  const described = tabs.map((tab) => ({ tab, view: describe(tab) }));
  const PINNED_COMPOSITE_W = 52;
  const PINNED_W = 34;
  // Regular tabs stop shrinking while the label still has a few words: below
  // this floor the tail hides behind the "more tabs" menu instead of robbing
  // the label down to a stray letter next to the two icons.
  const REGULAR_MIN_W = 140;
  const REGULAR_MAX_W = 200;
  const TAB_GAP = 4;
  // The trailing button (⋯ or +) sits right after the last tab, never pushed
  // to the right edge: the rail is content-sized, capped so this button (and
  // the error buttons, when present) keep their room. The loading spinner
  // rides inside the tab row, so it costs room too.
  const BUTTON_W = 28;
  const SPINNER_W = 20;
  const buttonReserve = BUTTON_W + TAB_GAP
    + ((loadError || error) ? BUTTON_W + TAB_GAP : 0)
    + (error === "destination_unavailable" ? BUTTON_W + TAB_GAP : 0)
    + (loading ? SPINNER_W : 0)
    // Dynamic margin the fit never eats into: the measurement is not trusted
    // to the last pixel, and a row that ends flush at the container edge
    // leaves no room for the trailing buttons to breathe. Reaching the margin
    // is what tips the tail behind the "more tabs" menu — unpinned tabs
    // shrink uniformly to their floor first, the menu takes over after.
    + RAIL_MARGIN;
  const pinnedWidth = (composite: boolean) => (composite ? PINNED_COMPOSITE_W : PINNED_W);
  let visible = described;
  let hidden: typeof described = [];
  let regularWidth = REGULAR_MAX_W;
  if (available > 0) {
    const railBudget = Math.max(available - buttonReserve, 0);
    const minOf = ({ tab, view }: (typeof described)[number]) => (tab.pinned ? pinnedWidth(view.composite) : REGULAR_MIN_W);
    const minTotal = described.reduce((sum, d, i) => sum + minOf(d) + (i ? TAB_GAP : 0), 0);
    if (minTotal <= railBudget) {
      const regular = described.filter((d) => !d.tab.pinned).length;
      const pinnedTotal = described.reduce((sum, d) => sum + (d.tab.pinned ? pinnedWidth(d.view.composite) : 0), 0);
      regularWidth = regular
        ? Math.min(REGULAR_MAX_W, Math.floor((railBudget - pinnedTotal - (described.length - 1) * TAB_GAP) / regular))
        : REGULAR_MAX_W;
    } else {
      let used = 0;
      let count = 0;
      for (const d of described) {
        const cost = minOf(d) + (count ? TAB_GAP : 0);
        if (used + cost > railBudget) break;
        used += cost;
        count++;
      }
      count = Math.max(count, 1);
      visible = described.slice(0, count);
      hidden = described.slice(count);
      regularWidth = REGULAR_MIN_W;
    }
  }
  return <>
    <div ref={strip} className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden pr-2">
      <div role="tablist" aria-label={t("label")} aria-busy={loading || busy}
        className="flex min-w-0 items-center gap-1 overflow-hidden py-1"
        style={available > 0 ? { maxWidth: Math.max(available - buttonReserve, 0) } : undefined}
        onKeyDown={(event) => {
          const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
          const index = controls.indexOf(document.activeElement as HTMLButtonElement);
          if (index < 0) return;
          let next: number;
          if (event.key === "ArrowRight") next = (index + 1) % controls.length;
          else if (event.key === "ArrowLeft") next = (index + controls.length - 1) % controls.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = controls.length - 1;
          else return;
          event.preventDefault(); controls[next]?.focus();
        }}>
        <DndContext sensors={sensors} collisionDetection={collisionDetection} modifiers={horizontalDragModifiers}
          onDragStart={(event: DragStartEvent) => setDragged(String(event.active.id))}
          onDragCancel={() => setDragged(null)} onDragEnd={finishDrag}>
        <SortableContext items={visible.map(({ tab }) => tab.id)} strategy={horizontalListSortingStrategy}>
        {visible.map(({ tab, view }) => {
          const { section, projectId, project, objectiveId, objective, pageIcon, composite, label } = view;
          return <SortableAppTab key={tab.id} id={tab.id} disabled={busy}
            onKeyDown={(event) => {
              if (!event.altKey || !event.shiftKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
              event.preventDefault(); event.stopPropagation();
              const group = tabs.filter((row) => row.pinned === tab.pinned);
              const index = group.findIndex((row) => row.id === tab.id);
              if (event.key === "ArrowLeft" && index > 0) void session.move(tab.id, group[index - 1].id);
              if (event.key === "ArrowRight" && index < group.length - 1) void session.move(tab.id, group[index + 2]?.id ?? null);
            }}>
          <AppTabItem tab={tab} active={tab.id === activeId} focusable={tab.id === focusId} label={label}
            icon={pageIcon
              ? <span className="text-sm leading-none" aria-hidden>{pageIcon}</span>
              : <AppTabIcon section={section} project={project} projectId={projectId}
                  objectiveColor={objectiveId ? objective?.color ?? null : undefined} />}
            badge={sectionBadges(section)} busy={busy} last={tabs.length <= 1}
            compositeIcon={composite} width={tab.pinned ? undefined : regularWidth}
            onActivate={() => { if (!busy) void session.activate(tab.id); }} onClose={() => close(tab.id)}
            onWarm={() => { if (tab.id !== activeId) session.prefetch(tab.href); }}
            onPin={() => { void session.update(tab.id, { pinned: !tab.pinned }); }}
            onRename={() => { setName(tab.custom_name ?? ""); setRenaming(tab); }} onFocus={() => setFocused(tab.id)} />
          </SortableAppTab>;
        })}
        </SortableContext>
        <DragOverlay dropAnimation={null} modifiers={horizontalDragModifiers}>
          {draggedTab && (() => {
            const { section, projectId, project, objectiveId, objective, composite, label } = describe(draggedTab);
            return <div className={draggedTab.pinned
              ? `flex h-[34px] ${composite ? "w-[52px]" : "w-[34px]"} items-center justify-center rounded-md bg-sidebar-accent text-sidebar-foreground shadow-lg`
              : "flex h-[34px] items-center gap-2 rounded-md bg-sidebar-accent px-2.5 text-sm text-sidebar-foreground shadow-lg"}
              style={draggedTab.pinned ? undefined : { width: regularWidth }}>
              <AppTabIcon section={section} project={project} projectId={projectId}
                objectiveColor={objectiveId ? objective?.color ?? null : undefined} />
              {!draggedTab.pinned && <span className="truncate">{label}</span>}
            </div>;
          })()}
        </DragOverlay>
        </DndContext>
        {loading && <Loader2 aria-label={t("loading")} className="size-4 shrink-0 animate-spin" />}
      </div>
      {hidden.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={t("moreTabs")}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring">
              <Ellipsis className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
            <DropdownMenuItem disabled={busy || loading || loadError} onPointerEnter={onNewTabWarm} onFocus={onNewTabWarm}
              onSelect={() => onNewTab()}>
              <Plus />
              {t("newTab")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {hidden.map(({ tab, view }) => (
              <DropdownMenuItem key={tab.id} onPointerEnter={() => session.prefetch(tab.href)} onFocus={() => session.prefetch(tab.href)} onSelect={() => { if (!busy) void session.activate(tab.id); }}>
                <AppTabIcon section={view.section} project={view.project} projectId={view.projectId}
                  objectiveColor={view.objectiveId ? view.objective?.color ?? null : undefined} />
                <span className="truncate">{view.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Tooltip><TooltipTrigger asChild><button type="button" aria-label={t("newTab")} disabled={busy || loading || loadError}
          onClick={onNewTab} onMouseEnter={onNewTabWarm} onFocus={onNewTabWarm}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
          <Plus className="size-4" aria-hidden />
        </button></TooltipTrigger><TooltipContent side="bottom">{t("newTab")}</TooltipContent></Tooltip>
      )}
      {(loadError || error) && <Tooltip><TooltipTrigger asChild><button type="button" aria-label={t("retry")}
        onClick={() => { reload(); void session.retry(); }} className="flex size-7 shrink-0 items-center justify-center text-destructive">
        <AlertCircle className="size-4" aria-hidden /><span role="alert" className="sr-only">{t(errorKey)}</span>
      </button></TooltipTrigger><TooltipContent side="bottom">{t(errorKey)} {t("retry")}</TooltipContent></Tooltip>}
      {error === "destination_unavailable" && <Tooltip><TooltipTrigger asChild><button type="button" aria-label={nav("home")}
        disabled={busy} onClick={() => { void session.goHome(); }} className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-sidebar-accent">
        <Home className="size-4" aria-hidden />
      </button></TooltipTrigger><TooltipContent side="bottom">{nav("home")}</TooltipContent></Tooltip>}
    </div>
    <Dialog open={Boolean(renaming)} onOpenChange={(open) => { if (!open) setRenaming(null); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{t("rename")}</DialogTitle><DialogDescription>{t("renameHint")}</DialogDescription></DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); if (renaming) void session.update(renaming.id, { custom_name: name.trim() || null }).then(() => { if (!session.getSnapshot().error) setRenaming(null); }); }}>
          <label htmlFor="app-tab-name" className="mb-2 block text-sm">{t("name")}</label>
          <Input id="app-tab-name" autoFocus value={name} maxLength={APP_TAB_MAX_NAME} onChange={(event) => setName(event.target.value)} />
          <DialogFooter className="mt-4"><Button type="button" variant="outline" onClick={() => setRenaming(null)}>{common("cancel")}</Button>
            <Button type="submit" disabled={busy}>{common("save")}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}

function SortableAppTab({ id, disabled, onKeyDown, children }: {
  id: string;
  disabled: boolean;
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  children: React.ReactNode;
}) {
  const { setNodeRef, transform, transition, isDragging, listeners } = useSortable({ id, disabled });
  return <div ref={setNodeRef} role="presentation" {...listeners} onKeyDown={onKeyDown}
    className={isDragging ? "shrink-0 opacity-40" : "shrink-0"}
    style={{ transform: CSS.Transform.toString(transform), transition, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
    {children}
  </div>;
}
