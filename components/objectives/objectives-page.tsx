"use client";

import { useMobileCollectionState } from "@/lib/mobile-collection-state";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, FilterIcon, Target01Icon } from "@hugeicons/core-free-icons";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AppTabRouteBoundary, useAppTabActive, useAppTabRoute } from "@/lib/app-tab-route-context";
import { useOptionalAppTabNavigation } from "@/lib/app-tab-navigation-context";
import Link from "@/components/app-link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Kbd } from "@/components/ui/kbd";
import { useProjects } from "@/lib/projects-context";
import { useProjectCapabilities } from "@/lib/use-project-capabilities";
import {
  useAssistantContext,
  useAssistantPanelActions,
} from "@/lib/assistant-panel-context";
import { usePublishCurrentView } from "@/lib/current-view-context";
import { buildViewHref } from "@/lib/view-href";
import { useObjectivesQuery, objectiveProgress } from "@/lib/use-objectives-query";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useMembersQuery } from "@/lib/use-members-query";
import {
  OBJECTIVE_STATUSES,
  OBJECTIVE_STATUS_MAP,
  type ObjectiveStatus,
} from "@/lib/objective-constants";
import { EmptyScene } from "@/components/empty-scene";
import { ObjectiveStatusIndicator } from "@/components/issue-indicators";
import { NumoIcon } from "@/components/numo-icon";
import { ObjectiveProgressStat } from "@/components/objective-progress";
import { SearchMenu } from "@/components/search-menu";
import { checkedProps } from "@/components/search-select";
import { CollectionSidebar, type SidebarBrowseTarget } from "@/components/secondary-sidebar";
import { matchesFilter } from "@/components/sidebar-filter-field";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display-name";
import { SIDEBAR_HEADER_ACTION_CLASS } from "@/lib/sidebar-control-styles";
import { ObjectiveDetail } from "@/components/objective-detail";
import type { MessageKey } from "@/lib/i18n-keys";
import type { Member, Objective } from "@/lib/types";
import { matchesObjectiveState, secondarySelectionId } from "@/lib/secondary-view-selection";
import { deepLinkNeedsAllFilter } from "@/lib/sidebar-deep-link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { commentTarget } from "@/lib/comment-focus";

const ObjectiveDialog = dynamic(
  () => import("@/components/objective-dialog").then((m) => m.ObjectiveDialog),
  { ssr: false },
);

/**
 * What the column shows. The four states of a goal, plus the two that
 * are not: “active” — that which is neither finished nor canceled, and the point of
 * start of the page — and “all”.
 *
 * The status of a goal is DERIVED from its tickets (migration
 * `objective_status_auto`): a goal that has just been set is “planned”
 * as long as none of its tickets have started. This is why the defect is not
 * not the only “in progress” status — it would hide everything we have just created.
 */
type ObjectiveStateFilter = "active" | ObjectiveStatus | "all";

const matchesState = matchesObjectiveState;

/**
 * The title of the empty column when it is THIS state, and only this state, which empties it —
 * “no objective completed” says what we were looking for, where “none in these
 * filters" returns the user to reopen the menu to remember which ones.
 * “All” does not appear there: a state which excludes nothing has nothing to name, and
 * this surface is processed before rendering the column.
 *
 * Typed as `MessageKey` and not as `string`: a key that does not exist does not compile
 * not (see CLAUDE.md), where a `Record<string, string>` would calmly display
 * “Objectives.emptyDone” on screen.
 */
const EMPTY_BY_STATE: Record<
  Exclude<ObjectiveStateFilter, "all">,
  MessageKey<"Objectives">
> = {
  active: "emptyActive",
  planned: "emptyPlanned",
  in_progress: "emptyInProgress",
  done: "emptyDone",
  canceled: "emptyCanceled",
};

/**
 * The column filter — the same combobox as pull requests and
 * returns, for the same reason: on a line of 320 px there is no space left
 * only an icon, and what a label would have said goes into the tooltip. A
 * pellet signals from afar that a filter is installed; without it, a list
 * restricted would have nothing left to say about it.
 */
function ObjectiveFilterMenu({
  state,
  onStateChange,
}: {
  state: ObjectiveStateFilter;
  onStateChange: (state: ObjectiveStateFilter) => void;
}) {
  const t = useTranslations("Objectives");
  const tStatus = useTranslations("ObjectiveStatus");
  const [open, setOpen] = useState(false);

  const stateLabel =
    state === "active"
      ? t("filterActive")
      : state === "all"
        ? t("filterAll")
        : tStatus(state);
  // “Assets” is the starting point: nothing to report. Everything else restricted
  // the list, and should be seen without opening the menu.
  const active = state !== "active";
  const tooltip = t("filterTooltip", { state: stateLabel });

  const pick = (next: ObjectiveStateFilter) => {
    onStateChange(next);
    setOpen(false);
  };

  return (
    <SearchMenu
      open={open}
      onOpenChange={setOpen}
      align="end"
      tooltip={tooltip}
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          className={SIDEBAR_HEADER_ACTION_CLASS}
          aria-label={tooltip}
        >
          <span className="relative flex items-center justify-center">
            <HugeiconsIcon icon={FilterIcon} className="size-4" />
            {active ? (
              /* The ring in the color of the bar detaches the pellet from the line
 of the icon, which passes just below. */
              <span
                aria-hidden
                className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary ring-2 ring-sidebar"
              />
            ) : null}
          </span>
        </Button>
      }
    >
      <CommandGroup heading={t("filterStateLabel")}>
        <CommandItem
          value="state-active"
          keywords={[t("filterActive")]}
          onSelect={() => pick("active")}
          {...checkedProps(state === "active")}
        >
          <span className="truncate">{t("filterActive")}</span>
        </CommandItem>
        {OBJECTIVE_STATUSES.map((s) => {
          return (
            <CommandItem
              key={s.value}
              value={`state-${s.value}`}
              keywords={[tStatus(s.value)]}
              onSelect={() => pick(s.value)}
              {...checkedProps(state === s.value)}
            >
              <ObjectiveStatusIndicator status={s.value} className="size-4" />
              <span className="truncate">{tStatus(s.value)}</span>
            </CommandItem>
          );
        })}
        <CommandItem
          value="state-all"
          keywords={[t("filterAll")]}
          onSelect={() => pick("all")}
          {...checkedProps(state === "all")}
        >
          <span className="truncate">{t("filterAll")}</span>
        </CommandItem>
      </CommandGroup>
    </SearchMenu>
  );
}

/**
 * One row of the column — same template as sort, returns and pull
 * requests: a rounded pellet in an 8 px gutter. What the line
 * door is what we compare from one objective to another: its color, its name, its
 * status, its progress, its manager.
 */
function ObjectiveRow({
  projectId,
  objective,
  selected,
  progress,
  lead,
  onSelect,
}: {
  projectId: string;
  objective: Objective;
  selected: boolean;
  progress: { done: number; total: number; percent: number };
  lead: Member | null;
  onSelect: () => void;
}) {
  const tStatus = useTranslations("ObjectiveStatus");
  const status = OBJECTIVE_STATUS_MAP[objective.status];
  return (
    <button
      type="button"
      data-sidebar-filter-result
      data-navigation-href={`/projects/${projectId}/objectives?open=${encodeURIComponent(objective.id)}`}
      data-comment-target={commentTarget("objective", objective.id)}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-lg px-3 py-2.5 text-left outline-none transition-colors",
        selected ? "bg-muted" : "hover:bg-muted/60 focus-visible:bg-muted/60"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: objective.color ?? "var(--muted-foreground)" }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {objective.name}
        </span>
        {lead && (
          <UserAvatar
            seed={lead.avatar_seed}
            title={displayName(lead)}
            className="size-5 shrink-0"
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        <ObjectiveStatusIndicator status={status.value} className="size-3.5" />
        <span className="shrink-0 text-xs text-muted-foreground">
          {tStatus(status.value)}
        </span>
        {/* The count first, then the ring: it is the ring that falls on the
 right edge, at the same abscissa from one row to the next — the column se
 iterates over this row of circles, not over numbers which
 change width. */}
        <ObjectiveProgressStat progress={progress} countFirst className="ml-auto" />
      </div>
    </button>
  );
}

function ObjectivesInner({ projectId: browseProjectId, browse }: { projectId?: string; browse?: SidebarBrowseTarget } = {}) {
  const t = useTranslations("Objectives");
  const tCommon = useTranslations("Common");
  const tSeed = useTranslations("Seed");
  const { projectId: routeProjectId, pathname: livePathname, searchParams } = useAppTabRoute();
  const projectId = browseProjectId ?? routeProjectId!;
  const pathname = browse ? `/projects/${projectId}/objectives` : livePathname;
  const active = useAppTabActive();
  const navigation = useOptionalAppTabNavigation();
  const consumeSelection = useCallback(() => {
    if (active && window.location.pathname === pathname &&
        (!navigation || navigation.session.getSnapshot().activeId === navigation.activeId)) {
      window.history.replaceState(null, "", pathname);
    }
  }, [active, navigation, pathname]);
  const newParam = browse ? null : searchParams.get("new");
  const openParam = browse ? null : searchParams.get("open");

  const { projects, loading: projectsLoading } = useProjects();
  const project = projects.find((p) => p.id === projectId);
  // Project readers (MIN-693) browse objectives without creating any.
  const { canWrite } = useProjectCapabilities(projectId);

  const { objectives, loading, createObjective, updateObjective, deleteObjective } =
    useObjectivesQuery(projectId);
  const { issues } = useIssuesQuery(projectId);
  const { members } = useMembersQuery(projectId, !!project);
  const { open: openAssistant } = useAssistantPanelActions();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMounted, setDialogMounted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useMobileCollectionState(`/projects/${projectId}/objectives`, "query", "");
  /**
   * The state shown by the column. Default “Assets”: an objectives page
   * which piles up two years of completed projects no longer says where we are.
   */
  const [state, setState] = useMobileCollectionState<ObjectiveStateFilter>(`/projects/${projectId}/objectives`, "state", "active");
  /** In-flight dictation in detail — see `ObjectiveDetail.onBusyChange`. */
  const [dictationBusy, setDictationBusy] = useState(false);

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.user_id, m])),
    [members]
  );

  /**
   * What the state filter lets pass — and therefore what the selection
   * lives. A lens taken out of the filter (completed while looking at it) must
   * hand over to the next one, as if it had been deleted.
   */
  const filtered = useMemo(
    () => objectives.filter((o) => matchesState(o, state)),
    [objectives, state]
  );

  const selected = filtered.find((o) => o.id === selectedId) ?? null;

  /**
   * What the column DISPLAYS. One notch BELOW `filtered`, which carries the
   * selection: the text filter must not move it, otherwise each keystroke
   * would change the lens open to the right - whereas we filter precisely for
   * go find another one, and choose it yourself.
   */
  const listed = useMemo(() => {
    if (!query.trim()) return filtered;
    return filtered.filter((o) => matchesFilter(query, [o.name, o.description]));
  }, [filtered, query]);

  /**
   * Progress per objective, computed once per data/filter change instead of
   * once per row per render: `objectiveProgress` filters the whole issue list
   * for each call, so the naive per-row call turned every keystroke of this
   * filter into an objectives × issues scan. One pass buckets the issues by
   * objective, each row then only walks its own bucket.
   */
  const progressByObjectiveId = useMemo(() => {
    const linkedByObjective = new Map<string, typeof issues>();
    for (const issue of issues) {
      if (!issue.objective_id) continue;
      const bucket = linkedByObjective.get(issue.objective_id);
      if (bucket) bucket.push(issue);
      else linkedByObjective.set(issue.objective_id, [issue]);
    }
    return new Map(
      listed.map((objective) => [
        objective.id,
        objectiveProgress(objective.id, linkedByObjective.get(objective.id) ?? []),
      ]),
    );
  }, [listed, issues]);

  // Publish the objective being viewed (else just the project) to Numo.
  useAssistantContext(
    !browse && project
      ? selected
        ? {
            projectId,
            objectiveId: selected.id,
            objectiveName: selected.name,
            objectiveColor: selected.color,
            objectiveStatus: selected.status,
          }
        : { projectId }
      : null
  );

  /**
   * Change objective—denied as long as Numo holds dictation on which one is
   * open: its patch aims for THIS objective, and changing it now would throw it away.
   * A selection without effect would pass for a failure, hence the word.
   */
  const select = useCallback(
    (id: string) => {
      if (dictationBusy && id !== selectedId) {
        toast.info(t("dictationInFlight"), { id: "dictation-in-flight" });
        return;
      }
      setSelectedId(id);
    },
    [dictationBusy, selectedId, t]
  );

  // Keep a valid selection: the first objective by default, and the next
  // when the one that was open disappears (deletion, change of filter).
  useEffect(() => {
    const next = secondarySelectionId(filtered, null, selectedId);
    if (next !== selectedId) setSelectedId(next);
  }, [filtered, selectedId]);

  // The New objective command opens the create dialog through ?new=1.
  useEffect(() => {
    if (active && newParam === "1") {
      setDialogOpen(true);
      consumeSelection();
    }
  }, [active, newParam, consumeSelection]);

  useEffect(() => {
    if (dialogOpen) setDialogMounted(true);
  }, [dialogOpen]);

  // Deep link (notifications, palette): ?open=<id> selects THIS goal
  // rather than the first one in the list, then purges the setting so that one
  // background refetch does not bring the selection back here. We wait for him to be
  // really loaded: purging before the arrival of the objectives would leave the effect
  // above fall back on the first, and the link would be lost cold.
  //
  // Keep the current lens when it already contains the target. Completed or
  // canceled objectives still widen it so the deep link always opens.
  //
  // Each link settles ONCE (MIN-814). A retained app tab keeps `?open=` in its
  // route — it is the published selection — so without this guard every lens
  // change re-ran the widening: picking "Active" while a completed objective
  // was open snapped the filter straight back to "All". Once settled, the
  // filter is the reader's, and the effect above picks a matching objective.
  const settledOpenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!openParam) {
      settledOpenRef.current = null;
      return;
    }
    if (!active || settledOpenRef.current === openParam) return;
    if (secondarySelectionId(objectives, openParam) !== openParam) return;
    settledOpenRef.current = openParam;
    if (
      deepLinkNeedsAllFilter(
        objectives,
        (objective) => objective.id === openParam,
        (objective) => matchesState(objective, state),
      )
    ) {
      setState("all");
    }
    setSelectedId(openParam);
    consumeSelection();
  }, [active, openParam, objectives, consumeSelection, state]);

  // The open objective in the right pane is a SELECTION on the page, not an
  // overlay — it belongs to the screen's address. It leaves the URL as soon as
  // `?open=` is consumed above, hence this publication for the app tab;
  // `?open=` is also what restores it.
  usePublishCurrentView(browse ? null : {
    href: buildViewHref(pathname, searchParams.toString(), {
      open: selected?.id ?? null,
    }),
  });

  // Objective creation is keyboard-driven by the app-wide `O` shortcut now
  // (see CreateProvider) — no page-local `C` handler.

  if (projectsLoading && !project) {
    return (
      <div className="px-6 py-10">
        <Skeleton className="h-8 w-64" />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
        <h1 className="font-display text-xl font-semibold">{t("projectNotFound")}</h1>
        <Button asChild variant="outline">
          <Link href="/home">{t("backToHome")}</Link>
        </Button>
      </div>
    );
  }

  /* `projectId` is not just the button label: it is the prefix of
 attachment storage, the scope of local drafts, and the
 project that the dictation route is querying. */
  const createDialog = dialogMounted ? (
    <ObjectiveDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      members={members}
      objective={null}
      // The objectives page creates in its own project: the "Create in"
      // row names it without offering another one.
      projects={[project]}
      projectId={projectId}
      projectKey={project.key}
      onCreate={async (input) => {
        const { objective, persisted } = createObjective(input);
        // Its page opens once the server has the row it reads.
        persisted.then(
          (created) => browse?.onSelect(`/projects/${projectId}/objectives?open=${encodeURIComponent(created.id)}`),
          () => undefined,
        );
        return objective;
      }}
      onUpdate={updateObjective}
    />
  ) : null;

  // No objective at all (not “nothing in this filter”): the column stays,
  // with its search and its “+”, and carries a compact scene with the first
  // gesture; the pane says where to start rather than "select a goal".
  const sidebar = (
      <CollectionSidebar browse={browse}
        title={t("title")}
        hiddenOnMobile
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: t("filterPlaceholder", { count: listed.length }),
          clearLabel: tCommon("clearFilter"),
        }}
        actions={
          /* Icons alone: ​​the complete labels ate up the line. This
 they said comes back to hover — the app tooltip, not
 the browser tooltip. The `-mr-2` only goes on the LAST:
 it is this which must align with the right edge of the lines of the
 list, not 8 px below. */
          <>
            <ObjectiveFilterMenu state={state} onStateChange={setState} />
            {canWrite && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={SIDEBAR_HEADER_ACTION_CLASS}
                  aria-label={t("newObjective")}
                  onClick={() => setDialogOpen(true)}
                >
                  <HugeiconsIcon icon={Add01Icon} className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="flex items-center gap-2">
                <span>{t("newObjective")}</span>
                <Kbd size="sm">O</Kbd>
              </TooltipContent>
            </Tooltip>
            )}
          </>
        }
      >
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : listed.length === 0 ? (
          /* No objective at all: the scene offers the first one. Otherwise a
 filter emptied the column. Which is not a detail — "nothing matches"
 is fixed by deleting three letters, "no goals completed" asks to
 reopen the status menu, hence the button, which has nothing to offer
 as long as it is the input that is restricting. */
          <EmptyScene
            size="compact"
            icon={Target01Icon}
            title={
              objectives.length === 0 ? t("emptyTitle") : !query.trim() && state !== "all"
                ? t(EMPTY_BY_STATE[state])
                : tCommon("noFilterMatch")
            }
            className="py-10"
          >
            {objectives.length === 0 ? (
              canWrite ? (
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  <HugeiconsIcon icon={Add01Icon} />
                  {t("newObjective")}
                </Button>
              ) : null
            ) : query.trim() || state === "all" ? null : (
              <Button variant="outline" size="sm" onClick={() => setState("all")}>
                {t("emptyShowAll")}
              </Button>
            )}
          </EmptyScene>
        ) : (
          <div className="flex flex-col gap-1 pt-2 pb-4">
            {listed.map((objective) => (
              <ObjectiveRow
                projectId={projectId}
                key={objective.id}
                objective={objective}
                selected={objective.id === selectedId}
                progress={progressByObjectiveId.get(objective.id) ?? { done: 0, total: 0, percent: 0 }}
                lead={
                  objective.lead_user_id
                    ? memberMap.get(objective.lead_user_id) ?? null
                    : null
                }
                onSelect={() => select(objective.id)}
              />
            ))}
          </div>
        )}
      </CollectionSidebar>
  );

  if (browse) return <>{sidebar}{createDialog}</>;

  if (!loading && objectives.length === 0) {
    return (
      <div className="flex h-full min-h-0">
        {sidebar}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
            <div className="mx-auto max-w-5xl">
              {/* Same form as the empty board (MIN-173): a scene, a sentence,
 the gestures that fill the page. The scene is the
 tab icon, placed on the ground — the page can be recognized by what names it
 in the sidebar. No import here: an objective cannot be exported from any tool. */}
              <EmptyScene icon={Target01Icon} title={t("emptyTitle")}>
                {canWrite && (
                <Button onClick={() => setDialogOpen(true)}>
                  <HugeiconsIcon icon={Add01Icon} />
                  {t("newObjective")}
                  <Kbd
                    size="sm"
                    className="ml-1 border-transparent bg-primary-foreground/15 text-primary-foreground"
                  >
                    O
                  </Kbd>
                </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    openAssistant({
                      projectId,
                      prompt: t("emptyNumoPrompt", { name: project.name }),
                    })
                  }
                >
                  <NumoIcon state="idle" className="size-4" />
                  {tSeed("emptyBoardCta")}
                </Button>
              </EmptyScene>
            </div>
          </div>
        </div>
        {createDialog}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Column: project objectives ────────────────────────────── */}
      {sidebar}

      {/* ── Detail: the open lens ───────────────────────────────────── */}
      <div
        data-comment-surface
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {selected ? (
          <ObjectiveDetail
            key={selected.id}
            objective={selected}
            projectId={projectId}
            projectKey={project?.key ?? ""}
            members={members}
            issues={issues}
            onUpdate={updateObjective}
            onDelete={async (id) => {
              await deleteObjective(id);
            }}
            onBusyChange={setDictationBusy}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">{t("noSelection")}</p>
          </div>
        )}
      </div>

      {createDialog}
    </div>
  );
}

export function ObjectivesCollection(props: { projectId: string; browse: SidebarBrowseTarget }) {
  return <AppTabRouteBoundary><ObjectivesInner {...props} /></AppTabRouteBoundary>;
}

export default function ObjectivesPage() {
  return (
    <AppTabRouteBoundary><Suspense
      fallback={
        <div className="px-6 py-10">
          <Skeleton className="h-8 w-64" />
        </div>
      }
    >
      <ObjectivesInner />
    </Suspense></AppTabRouteBoundary>
  );
}
