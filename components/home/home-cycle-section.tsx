"use client";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarClock, CircleDashed } from "lucide-react";
import { Skeleton, Tooltip, TooltipContent, TooltipTrigger } from "mangue-ui";
import { useHomeSummaryQuery } from "@/lib/use-home-summary-query";
import { useProjects } from "@/lib/projects-context";
import { cycleCompletionPercent, recoComparator } from "@/lib/cycle";
import { formatCycleRange, ProgressRing } from "@/components/cycle/cycle-header";
import {
  EffortIndicator,
  PriorityIndicator,
  StatusIndicator,
} from "@/components/issue-indicators";
import { isClosedStatus, issueIdentifier, type IssueStatus } from "@/lib/issue-constants";
import type { HomeSummaryIssue } from "@/lib/types";
import {
  HomeLead,
  HomeMore,
  HomeNote,
  HomeRow,
  HomeSection,
  HomeSectionLink,
} from "@/components/home/home-list";

/**
 * Combien de tickets du cycle la section montre. La carte d'avant en montrait
 * TROIS, dans une demi-colonne, sous deux jauges : on y voyait qu'un cycle
 * existait, jamais ce qu'il contenait. Six lignes pleine largeur, c'est assez
 * pour reconnaître sa quinzaine sans faire de l'accueil un second board — le
 * reste se compte, et « Ouvrir le cycle » y mène.
 */
const ROWS_SHOWN = 6;

/** La jauge d'avancement, seule rescapée des contrôles du board : le pourcentage
    de travail clos, dans le même vocabulaire (anneau + %) que /all. La capacité,
    elle, sert à REMPLIR un cycle — ça se fait sur le board, pas ici. */
function CycleCompletion({ percent }: { percent: number }) {
  const t = useTranslations("Cycles");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
          <ProgressRing
            percent={percent}
            colorClass="text-emerald-500"
            className="size-4"
          />
          {percent}%
        </span>
      </TooltipTrigger>
      <TooltipContent>{t("completionTooltip", { percent })}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Section « Cycle en cours » de l'accueil.
 *
 * C'est la seule section qui parle du PLAN plutôt que d'une file : elle reste
 * donc affichée même vide — un cycle sans ticket est une information, et savoir
 * qu'on n'a rien engagé pour la quinzaine vaut la ligne qu'elle prend.
 *
 * L'ordre des lignes est celui du board en mode cycle (`recoComparator`) : ce
 * qu'on peut attaquer d'abord, bloqueurs et priorité pris en compte. Les tickets
 * clos n'y figurent pas — ce qui reste à faire est la question ; ce qui est fait
 * se lit sur la jauge.
 */
export function HomeCycleSection() {
  const t = useTranslations("Home");
  const format = useFormatter();
  // MIN-89 : la section lit /api/me/summary, où seuls les tickets du cycle
  // courant sont matérialisés — plus les relations et les statuts bloquants
  // nécessaires à l'ordre reco.
  const { cycleIssues, relations, blockerStatuses, cycles, loading } =
    useHomeSummaryQuery();
  const { projects } = useProjects();

  const current = cycles?.current ?? null;

  const openIssues = useMemo(() => {
    if (!current) return [] as HomeSummaryIssue[];
    // Un bloqueur peut être HORS du cycle : la carte des statuts couvre les
    // tickets du cycle plus ceux d'en face des relations remontées.
    const statusById = new Map<string, IssueStatus>(Object.entries(blockerStatuses));
    for (const i of cycleIssues) statusById.set(i.id, i.status);
    return cycleIssues
      .filter((i) => !isClosedStatus(i.status))
      .sort(recoComparator(relations, statusById));
  }, [cycleIssues, relations, blockerStatuses, current]);

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  if (loading) {
    return (
      <HomeSection title={t("cycleTitle")}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </HomeSection>
    );
  }

  // Cycles jamais activés → l'invitation à les allumer (l'activation vit sur /all).
  if (!cycles?.enabled) {
    return (
      <HomeSection
        title={t("cycleTitle")}
        right={<HomeSectionLink href="/all?view=cycle" label={t("cycleActivate")} />}
      >
        <HomeNote icon={<CalendarClock className="size-4 shrink-0" />}>
          {t("cycleActivatePrompt")}
        </HomeNote>
      </HomeSection>
    );
  }

  // Activés mais entre deux cycles → la date d'ouverture du prochain.
  if (!current) {
    const next = cycles.upcoming[0] ?? null;
    return (
      <HomeSection
        title={t("cycleTitle")}
        right={<HomeSectionLink href="/all?view=cycle" label={t("openCycle")} />}
      >
        <HomeNote icon={<CalendarClock className="size-4 shrink-0" />}>
          {next
            ? t("cycleNextStart", { date: formatCycleRange(format, next) })
            : t("cycleActivatePrompt")}
        </HomeNote>
      </HomeSection>
    );
  }

  const rows = openIssues.slice(0, ROWS_SHOWN);
  const overflow = openIssues.length - rows.length;
  const percent = cycleCompletionPercent(cycleIssues);

  return (
    <HomeSection
      title={t("cycleTitle")}
      meta={formatCycleRange(format, current)}
      right={
        <>
          {percent !== null && <CycleCompletion percent={percent} />}
          <HomeSectionLink href="/all?view=cycle" label={t("openCycle")} />
        </>
      }
    >
      {rows.length === 0 ? (
        <HomeNote icon={<CircleDashed className="size-4 shrink-0" />}>
          {t("cycleEmpty")}
        </HomeNote>
      ) : (
        rows.map((issue) => {
          const project = projectById.get(issue.project_id);
          // « Aucune » priorité, c'est quatre barres vides : du bruit sur chaque
          // ligne pour ne rien dire. Et un ticket sans priorité ni effort ne
          // passe pas de colonne du tout — un fragment vide compterait quand
          // même pour la gouttière de la ligne.
          const hasPriority = issue.priority !== "none";
          return (
            <HomeRow
              key={issue.id}
              // Le board cross-projet en mode cycle forcé (MIN-67), panneau du
              // ticket ouvert — la même destination que « Ouvrir le cycle ».
              href={`/all?view=cycle&issue=${issue.id}`}
              icon={<StatusIndicator status={issue.status} className="size-4" />}
              kind={t("cycleTitle")}
              lead={
                project ? (
                  <HomeLead>{issueIdentifier(project.key, issue.number)}</HomeLead>
                ) : null
              }
              title={issue.title}
              meta={
                hasPriority || issue.effort ? (
                  <>
                    {hasPriority && (
                      // Le pixel n'est pas un réglage au jugé : les deux encres
                      // sont déjà CONCENTRIQUES à la mesure (même centre au
                      // centième près). Ce qui se voit est optique — le triangle
                      // porte toute sa masse sur sa base, la pile de barres
                      // occupe sa boîte de haut en bas, et la priorité paraît
                      // donc monter. Les aligner sur leur BASE commune, et non
                      // sur leur boîte, remet les deux glyphes d'aplomb. Correction
                      // locale à ce couple : ailleurs (cartes du board, panneau)
                      // les deux champs ne se touchent pas.
                      <PriorityIndicator
                        priority={issue.priority}
                        className="translate-y-px"
                      />
                    )}
                    {issue.effort && <EffortIndicator effort={issue.effort} />}
                  </>
                ) : null
              }
              project={project}
            />
          );
        })
      )}
      {overflow > 0 && <HomeMore>{t("cycleMore", { count: overflow })}</HomeMore>}
    </HomeSection>
  );
}
