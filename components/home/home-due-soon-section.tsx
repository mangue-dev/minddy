"use client";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "mangue-ui/lib/utils";
import { useHomeSummaryQuery } from "@/lib/use-home-summary-query";
import { useProjects } from "@/lib/projects-context";
import { EffortIndicator, StatusIndicator } from "@/components/issue-indicators";
import { issueIdentifier } from "@/lib/issue-constants";
import { isDueDateOverdue, parseDueDate, relativeDue } from "@/lib/due-date";
import {
  HomeLead,
  HomeMore,
  HomeRow,
  HomeSection,
} from "@/components/home/home-list";
import type { HomeSummaryIssue, Project } from "@/lib/types";

/** Combien de lignes la section montre. Au-delà, un compte — l'accueil est un
    tableau de bord, pas une liste de tickets (celle-là vit sur /all). */
const ROWS_SHOWN = 5;

/** Les trois jours qu'on nomme au lieu de les compter. */
const NAMED_DAY_KEY = {
  yesterday: "dueSoonYesterday",
  today: "dueSoonToday",
  tomorrow: "dueSoonTomorrow",
} as const;

/**
 * L'échéance dite en relatif : « demain à 14:00 », « dans 2 jours et 3 heures »,
 * « il y a 3 jours ». Une date absolue oblige à compter de tête ; ici la seule
 * chose qui compte — le temps qu'il reste — se lit directement.
 *
 * Le découpage vient de `relativeDue` (lib/due-date.ts) ; il ne reste ici que la
 * mise en mots, qui doit passer par le catalogue i18n.
 */
function RelativeDueLabel({ due }: { due: Date }) {
  const t = useTranslations("Home");
  const format = useFormatter();
  const rel = relativeDue(due);

  if (rel.kind === "named") {
    const day = t(NAMED_DAY_KEY[rel.day]);
    if (!rel.time) return <>{day}</>;
    return (
      <>
        {t("dueSoonDayAtTime", {
          day,
          time: format.dateTime(rel.time, { hour: "2-digit", minute: "2-digit" }),
        })}
      </>
    );
  }

  // Les heures ne s'ajoutent que si elles disent quelque chose : « dans 3 jours
  // et 0 heure » n'est pas une phrase.
  const { days, hours, past } = rel;
  if (hours === 0) {
    return <>{past ? t("dueSoonDaysAgo", { days }) : t("dueSoonInDays", { days })}</>;
  }
  return (
    <>
      {past
        ? t("dueSoonDaysHoursAgo", { days, hours })
        : t("dueSoonInDaysHours", { days, hours })}
    </>
  );
}

function DueSoonRow({
  issue,
  project,
}: {
  issue: HomeSummaryIssue;
  project: Project | undefined;
}) {
  const t = useTranslations("Home");
  const tIssue = useTranslations("Issue");
  const due = parseDueDate(issue.due_date);
  const overdue = due !== null && isDueDateOverdue(due);

  return (
    <HomeRow
      // Même destination que les autres aperçus de l'accueil : le board
      // cross-projet ouvre le panneau du ticket (components/global-board.tsx
      // consomme ?issue=).
      href={`/all?issue=${issue.id}`}
      icon={<StatusIndicator status={issue.status} className="size-4" />}
      kind={tIssue("entity")}
      lead={
        project ? <HomeLead>{issueIdentifier(project.key, issue.number)}</HomeLead> : null
      }
      title={issue.title}
      // L'effort est ce qui définit la fenêtre de proximité (lib/due-soon.ts) :
      // il explique, sur la ligne même, pourquoi ce ticket-là est déjà là.
      meta={issue.effort ? <EffortIndicator effort={issue.effort} /> : null}
      project={project}
      right={
        due ? (
          <span
            className={cn(
              "shrink-0 text-xs",
              overdue ? "font-medium text-destructive" : "text-muted-foreground",
            )}
            title={overdue ? t("dueSoonOverdue") : undefined}
          >
            <RelativeDueLabel due={due} />
          </span>
        ) : null
      }
    />
  );
}

/**
 * Section « Échéances proches » de l'accueil (MIN-96).
 *
 * La fenêtre de proximité n'est pas la même pour tous : elle vaut le poids
 * Fibonacci de l'effort du ticket (xs 1 jour … xl 8 jours, un ticket non estimé
 * comptant comme un M). Le tri est fait côté serveur — GET /api/me/summary,
 * `dueSoon` — parce que « jours restants » se compte dans le fuseau de
 * l'utilisateur ; voir lib/due-soon.ts.
 *
 * Rien à montrer → rien du tout : un tableau de bord ne garde pas de place pour
 * un état vide.
 */
export function HomeDueSoonSection() {
  const t = useTranslations("Home");
  const { dueSoon, loading } = useHomeSummaryQuery();
  const { projects } = useProjects();

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  // Pas de squelette pendant le chargement : la section est le plus souvent
  // vide, et un bloc qui apparaît pour disparaître aussitôt secouerait la page à
  // chaque visite. La section du cycle, elle, porte déjà l'attente.
  if (loading || dueSoon.length === 0) return null;

  const rows = dueSoon.slice(0, ROWS_SHOWN);
  const overflow = dueSoon.length - rows.length;

  return (
    <HomeSection title={t("dueSoonTitle")} count={dueSoon.length}>
      {rows.map((issue) => (
        <DueSoonRow
          key={issue.id}
          issue={issue}
          project={projectById.get(issue.project_id)}
        />
      ))}
      {overflow > 0 && <HomeMore>{t("dueSoonMore", { count: overflow })}</HomeMore>}
    </HomeSection>
  );
}
