"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Skeleton, Tooltip, TooltipContent, TooltipTrigger, cn } from "mangue-ui";
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
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useGitLinkedProjectsQuery } from "@/lib/use-project-git-link-query";
import { routinesQueryKey, useRoutinesQuery } from "@/lib/use-routines-query";
import { describeSchedule, weekdayName } from "@/lib/routine-schedule";
import type { Routine } from "@/lib/routines-api";

/**
 * L'onglet ROUTINES (MIN-185) de la vue Agents : la liste à gauche, la routine
 * choisie à droite.
 *
 * Deux règles gouvernent ce que l'écran offre :
 *  - **le « + » n'existe que sur un projet dont on est PROPRIÉTAIRE** et qui a
 *    un dépôt lié. Un bouton qui mène à un 403 ne s'affiche pas ;
 *  - **un membre VOIT quand même** les routines des projets qu'il a rejoints,
 *    et leurs exécutions. Ce qui tourne sur un dépôt partagé n'est pas un
 *    secret ; seul le geste de le poser appartient à celui qui paye.
 */
export function RoutinesPanel({
  selectedId,
  onSelect,
  mobileDetail,
  onBack,
  tabs,
}: {
  selectedId: string | null;
  onSelect: (routineId: string | null) => void;
  mobileDetail: boolean;
  onBack: () => void;
  /** Le sélecteur d'onglet Conversations / Routines, posé en tête de colonne. */
  tabs: ReactNode;
}) {
  const t = useTranslations("Routines");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { projects } = useProjects();
  const { projectIds: gitLinked } = useGitLinkedProjectsQuery();
  const { routines, loading } = useRoutinesQuery();

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
   * Ce que la colonne AFFICHE. Le filtre ne touche pas `routines`, qui porte la
   * sélection : sinon taper trois lettres ferait sauter la routine ouverte, une
   * fois par lettre. Une routine se cherche par son nom, son instruction ou son
   * projet — les trois choses que la ligne et son détail montrent.
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

  const groups = useMemo(
    () =>
      groupByProject(visible, (r) => {
        const project = projectById.get(r.project_id);
        return project
          ? {
              id: project.id,
              name: project.name,
              key: project.key,
              icon_url: project.icon_url,
            }
          : null;
      }),
    [visible, projectById],
  );

  const selected = routines.find((r) => r.id === selectedId) ?? null;
  const selectedIsOwner =
    !!selected && projectById.get(selected.project_id)?.owner_id === user?.id;

  /** Un projet éligible au « + » : possédé ET avec un dépôt à cloner. */
  const canCreateIn = (projectId: string | undefined) =>
    !!projectId &&
    projectById.get(projectId)?.owner_id === user?.id &&
    gitLinked.has(projectId);

  const anyEligible = projects.some((p) => canCreateIn(p.id));

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
    /* Un seul appel à l'action : le wizard. Les exemples pré-écrits vivent DANS
       son étape `job` — les proposer deux fois obligerait à les tenir à jour à
       deux endroits. */
    <div className="px-3 py-6">
      <EmptyScene icon={CalendarClock} title={t("emptyTitle")} size="compact">
        {anyEligible ? (
          <Button size="sm" onClick={() => openWizard()}>
            <Plus />
            {t("newRoutine")}
          </Button>
        ) : null}
      </EmptyScene>
    </div>
  ) : visible.length === 0 ? (
    // Le filtre a simplement vidé la liste : une ligne discrète suffit, la
    // colonne n'est pas vide, elle est restreinte.
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
          {g.items.map((routine) => (
            <RoutineRow
              key={routine.id}
              routine={routine}
              selected={routine.id === selectedId}
              onSelect={() => onSelect(routine.id)}
            />
          ))}
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
          /* Le « + » de la colonne, exactement à la place de celui des
             conversations. Il n'existe QUE si un projet peut en accueillir une
             (possédé, dépôt lié) : un bouton qui mène à un 403 ne s'affiche pas. */
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
        <div className="px-2 pt-2">{tabs}</div>
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
            isOwner={selectedIsOwner}
            onBack={onBack}
            onChanged={() => void refresh()}
            onDeleted={() => {
              onSelect(null);
              void refresh();
            }}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">{t("noSelection")}</p>
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
 * Une routine dans la liste : son titre, et sa cadence en sous-ligne — c'est la
 * question qu'on se pose en parcourant la colonne (« celle-là, elle tourne
 * quand ? »). Un point terne quand elle est en pause, un point d'alerte quand
 * son dernier passage a été sauté.
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
    { locale, weekdayLabel: (d) => weekdayName(d, locale) },
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex items-center gap-2 rounded-md py-1.5 pr-2 text-left outline-none transition-colors",
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
