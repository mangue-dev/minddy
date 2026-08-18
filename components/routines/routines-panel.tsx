"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Skeleton, cn } from "mangue-ui";
import { CalendarClock, Plus } from "lucide-react";

import { EmptyScene } from "@/components/empty-scene";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { matchesFilter } from "@/components/sidebar-filter-field";
import {
  PROJECT_GROUP_INDENT,
  SidebarProjectGroup,
  groupByProject,
  toggledSet,
} from "@/components/sidebar-project-group";
import { CreateRoutineWizard } from "@/components/routines/create-routine-wizard";
import { RoutineDetail } from "@/components/routines/routine-detail";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useGitLinkedProjectsQuery } from "@/lib/use-project-git-link-query";
import { routinesQueryKey, useRoutinesQuery } from "@/lib/use-routines-query";
import { describeSchedule } from "@/lib/routine-schedule";
import { useAgentModelsQuery } from "@/lib/use-agent-models-query";
import type { Routine } from "@/lib/routines-api";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * The ROUTINES page (MIN-185): the list on the left, the chosen routine on the right.
 *
 * Two rules govern what the screen offers:
 * - **the “+” only exists on a project of which one is the OWNER** and which has
 * a linked deposit. A button that leads to a 403 is not displayed;
 * - **a member still SEEs** the routines of the projects he has joined,
 * and their executions. What runs on a shared repository is not a
 * secret; only the gesture of placing it belongs to the one who pays.
 */
export function RoutinesPanel({
  selectedId,
  onSelect,
  mobileDetail,
  onBack,
}: {
  selectedId: string | null;
  onSelect: (routineId: string | null) => void;
  mobileDetail: boolean;
  onBack: () => void;
}) {
  const t = useTranslations("Routines");
  const tCommon = useTranslations("Common");
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { projects } = useProjects();
  const { projectIds: gitLinked, loading: gitLoading } = useGitLinkedProjectsQuery();
  const { routines, loading } = useRoutinesQuery();
  const {
    cloudExecutionConfigured,
    routineSchedulingConfigured,
    loading: agentCapabilitiesLoading,
  } = useAgentModelsQuery();

  const [wizardProjectId, setWizardProjectId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  /**
 * A project eligible for “+”: routine capabilities available, owned AND
 * with a repository to clone.
 *
 * Declared BEFORE the `useMemo` that call it, and not next to its other
 * readers: one `const` arrow stays in its dead zone until its line, and
 * a memo that calls it on first rendering raises a `ReferenceError` — which the
 * type-check does not see, since the reference is perfectly typed.
 */
  const canCreateIn = (projectId: string | undefined) =>
    !agentCapabilitiesLoading &&
    cloudExecutionConfigured &&
    routineSchedulingConfigured &&
    !!projectId &&
    projectById.get(projectId)?.owner_id === user?.id &&
    gitLinked.has(projectId);

  /**
 * What the column SHOWS. The filter does not touch `routines`, which carries the
 * selection: otherwise typing three letters would skip the open routine, one
 * time per letter. A routine is searched by its name, its instruction or its
 * project — the three things that the line and its detail show.
 */
  const visible = useMemo(() => {
    if (!query.trim()) return routines;
    return routines.filter((r) =>
      matchesFilter(query, [
        r.title,
        r.prompt,
        projectById.get(r.project_id)?.name ?? null,
      ]),
    );
  }, [routines, query, projectById]);

  const groups = useMemo(() => {
    const found = groupByProject(visible, (r) => {
      const project = projectById.get(r.project_id);
      return project
        ? {
            id: project.id,
            name: project.name,
            key: project.key,
            icon_url: project.icon_url,
            orb_seed: project.orb_seed,
          }
        : null;
    });
    // A FILTER in progress only shows what matches: an empty accordion
    // under a search would read as a result.
    if (query.trim()) return found;

    /**
 * Excluding the filter, ALL projects where you can add a routine have their
 * accordion, even empty ones. This is where the creation starts: the “+” lives
 * in the header of a project, and a project without routine therefore had
 * none. Projects where you are a simple MEMBER only enter if they have
 * routines to read: an empty header with nothing to see or anything to do is
 * just one more line to go through.
 *
 * These accordions are only seen from the FIRST routine: as long as
 * there is none, it is the empty state which holds the column, and it is
 * its button which opens the wizard.
 */
    const seen = new Set(found.map((g) => g.key));
    const extra = projects
      .filter((p) => !seen.has(p.id) && canCreateIn(p.id))
      .map((p) => ({
        key: p.id,
        project: {
          id: p.id,
          name: p.name,
          key: p.key,
          icon_url: p.icon_url,
          orb_seed: p.orb_seed,
        },
        items: [] as Routine[],
      }));
    return [...found, ...extra];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, projectById, projects, query, gitLinked, user?.id]);

  const selected = routines.find((r) => r.id === selectedId) ?? null;
  const selectedIsOwner =
    !!selected && projectById.get(selected.project_id)?.owner_id === user?.id;

  /**
 * Publishes the open routine to Numo — “change her time”, “put her in
 * pause”, “what is she doing again? » are then resolved on this one,
 * without looking for it, exactly as the ticket panel publishes its ticket
 * and the feedback dashboard its return.
 *
 * The PROJECT leaves with it: a routine only exists in its own, and the
 * routine tools the ask. Without routine selected, nothing is
 * published: this column is cross-project, and there would be no unique project
 * to announce.
 */
  useAssistantContext(
    selected
      ? {
          projectId: selected.project_id,
          routineId: selected.id,
          routineTitle: selected.title,
        }
      : null,
  );

  const anyEligible = projects.some((p) => canCreateIn(p.id));
  /**
 * WHY we can't put anything down, when this is the case. Three different walls,
 * and confusing them lets you search: no project at all, projects but
 * no linked repository (a routine clones a repository), or projects with a repository but
 * of which you are not the owner (only the owner commits his budget).
 *
 * The composition of conversations already says the second wall; the Routines
 * page said nothing, and its blank screen read like a bug.
 */
  const noRepoAnywhere = !gitLoading && projects.length > 0 && gitLinked.size === 0;
  const emptyReason =
    agentCapabilitiesLoading
      ? null
      : !cloudExecutionConfigured
        ? "emptyNoExecutionBackend"
        : !routineSchedulingConfigured
          ? "emptyNoScheduler"
          : projects.length === 0
            ? "emptyNoProject"
            : noRepoAnywhere
              ? "emptyNoRepo"
              : anyEligible
                ? null
                : "emptyNotOwner";
  /**
 * What the screen says when there is NO routine — the same phrase on both
 * sides, the column and the pane. A wall that prevents putting one (no
 * project, no linked repository, no owner) instead says: "create
 * your first routine" to someone who can't would be a dead end.
 */
  const emptyTitle = emptyReason
    ? t(emptyReason as "emptyNoRepo")
    : t("emptyTitle");

  const refresh = () => queryClient.invalidateQueries({ queryKey: routinesQueryKey() });

  const openWizard = (projectId?: string | null) => {
    setWizardProjectId(projectId ?? null);
    setWizardOpen(true);
  };

  const list = loading ? (
    <div className="flex flex-col gap-2 px-2 pt-2">
      {[0, 1].map((g) => (
        <div key={g} className="flex flex-col gap-1">
          <Skeleton className="h-6 w-32 rounded-md" />
          <Skeleton className="ml-8 h-5 rounded-md" />
        </div>
      ))}
    </div>
  ) : routines.length === 0 ? (
    /* NO routine, whatever the projects: the empty state goes before
 the accordions. An eligible but empty project does have its header and its
 “+” — but only from the second routine: as long as there is none, a stack of empty accordions says “there is nothing
 here” less well than a sentence and a button.

 One only call to action: the wizard. The pre-written examples live IN
 its `job` step — providing them twice would require keeping them updated in
 two places. */
    <div className="px-3 py-6">
      <EmptyScene icon={CalendarClock} title={emptyTitle} size="compact">
        {anyEligible ? (
          <Button size="sm" onClick={() => openWizard()}>
            <Plus />
            {t("createFirst")}
          </Button>
        ) : null}
      </EmptyScene>
    </div>
  ) : query.trim() && visible.length === 0 ? (
    // The filter has simply emptied the list: a discrete line is enough, the
    // column is not empty, it is restricted.
    <p className="px-4 py-6 text-center text-sm text-muted-foreground">
      {tCommon("noFilterMatch")}
    </p>
  ) : (
    <div className="flex flex-col gap-2 px-2 pt-2 pb-4">
      {groups.map((g) => (
        <SidebarProjectGroup
          key={g.key}
          project={g.project}
          fallbackLabel={tCommon("noProjectGroup")}
          open={!collapsedGroups.has(g.key)}
          collapsible
          onToggle={() => setCollapsedGroups((prev) => toggledSet(prev, g.key))}
          hiddenCount={0}
          onShowAll={() => {}}
          showMoreLabel={tCommon("showMore")}
          collapsedBadge={
            g.items.some((r) => r.last_error) ? (
              <span
                className="size-2 shrink-0 rounded-full bg-amber-500"
                aria-label={t("lastErrorBadge")}
              />
            ) : null
          }
          actions={
            canCreateIn(g.project?.id) ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => openWizard(g.project?.id)}
                    aria-label={t("newInProject", { project: g.project?.name ?? "" })}
                    className="pointer-events-none size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/project:pointer-events-auto group-hover/project:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t("newInProject", { project: g.project?.name ?? "" })}
                </TooltipContent>
              </Tooltip>
            ) : null
          }
        >
          {g.items.length === 0 ? (
            // An ELIGIBLE project but still empty: the line says what there is to
            // see (nothing) rather than leaving an accordion open to nothing,
            // which reads like an unsuccessful upload. The “+” of
            // the header is just above.
            <p
              className={cn(
                "py-1.5 pr-2 text-xs text-muted-foreground",
                PROJECT_GROUP_INDENT,
              )}
            >
              {t("groupEmpty")}
            </p>
          ) : (
            g.items.map((routine) => (
              <RoutineRow
                key={routine.id}
                routine={routine}
                selected={routine.id === selectedId}
                onSelect={() => onSelect(routine.id)}
              />
            ))
          )}
        </SidebarProjectGroup>
      ))}
    </div>
  );

  return (
    <>
      <SecondarySidebar
        title={t("title")}
        hiddenOnMobile={mobileDetail}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: t("filterPlaceholder", { count: visible.length }),
          clearLabel: tCommon("clearFilter"),
        }}
        actions={
          /* The “+” of the column, exactly in place of that of
 conversations. It ONLY exists if a project can accommodate one
 (owned, linked repository): a button that leads to a 403 is not displayed. */
          anyEligible ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => openWizard()}
                  className="-mr-2 text-muted-foreground hover:text-foreground"
                  aria-label={t("newRoutine")}
                >
                  <Plus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("newRoutine")}</TooltipContent>
            </Tooltip>
          ) : undefined
        }
      >
        {list}
      </SecondarySidebar>

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          mobileDetail ? "flex" : "hidden",
        )}
      >
        {selected ? (
          <RoutineDetail
            key={selected.id}
            routine={selected}
            project={projectById.get(selected.project_id) ?? null}
            isOwner={selectedIsOwner}
            onBack={onBack}
            onChanged={() => void refresh()}
            onDeleted={() => {
              onSelect(null);
              void refresh();
            }}
          />
        ) : loading ? (
          /* Nothing while loading: the column already shows its skeletons,
 and announcing "no routine" before having the answer would cause
 to flash an empty state on a list that is not empty. */
          null
        ) : routines.length === 0 ? (
          /* NO routine: the pane says the SAME thing as the column, en
 large. This is the surface we look at when arriving at the tab —
 leaving “choose a routine” when there is none
 sent searching in an empty column. */
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <EmptyScene icon={CalendarClock} title={emptyTitle}>
              {anyEligible ? (
                <Button onClick={() => openWizard()}>
                  <Plus className="size-4" />
                  {t("createFirst")}
                </Button>
              ) : null}
            </EmptyScene>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
            <p className="text-sm text-muted-foreground">{t("noSelection")}</p>
            {/* The gesture, under the sentence: arriving here without anything selected,
 is as often wanting to place one as wanting to read one. */}
            {anyEligible ? (
              <Button size="sm" variant="outline" onClick={() => openWizard()}>
                <Plus className="size-4" />
                {t("newRoutine")}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <CreateRoutineWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        initialProjectId={wizardProjectId}
        onCreated={(routine) => {
          void refresh();
          onSelect(routine.id);
        }}
      />
    </>
  );
}

/**
 * A routine in the list: its title, and its cadence in the sub-line - this is the
 * question that we ask ourselves when browsing the column ("this one runs
 * when?"). A dull point when it is paused, an alert point when
 * its last passage was skipped.
 */
function RoutineRow({
  routine,
  selected,
  onSelect,
}: {
  routine: Routine;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("Routines");
  const locale = useLocale();
  const cadence = describeSchedule(
    {
      frequency: routine.frequency,
      hour: routine.hour,
      minute: routine.minute,
      weekdays: routine.weekdays,
      daysOfMonth: routine.days_of_month,
      timezone: routine.timezone,
    },
    (key, values) => t(key, values),
    // Without the time zone: on a column line, “(Europe/Paris)” takes more
    // more space than the cadence itself. It reads in the routine.
    { locale, omitTimezone: true },
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        // `pr-3` and not `pr-2`: the status point (paused, missed passage)
        // touched the right edge of the column.
        "flex items-center gap-2 rounded-md py-1.5 pr-3 text-left outline-none transition-colors",
        PROJECT_GROUP_INDENT,
        selected ? "bg-muted" : "hover:bg-muted/60 focus-visible:bg-muted/60",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "truncate text-sm",
            routine.enabled ? "" : "text-muted-foreground",
          )}
        >
          {routine.title}
        </span>
        <span className="truncate text-xs text-muted-foreground">{cadence}</span>
      </span>
      {routine.last_error ? (
        <span
          className="size-2 shrink-0 rounded-full bg-amber-500"
          aria-label={t("lastErrorBadge")}
        />
      ) : !routine.enabled ? (
        <span
          className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
          aria-label={t("paused")}
        />
      ) : null}
    </button>
  );
}
