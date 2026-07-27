"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "mangue-ui/lib/utils";
import { useHomeSummaryQuery } from "@/lib/use-home-summary-query";
import { useProjects } from "@/lib/projects-context";
import { EffortIndicator, StatusIndicator } from "@/components/issue-indicators";
import { issueIdentifier } from "@/lib/issue-constants";
import { isDueDateOverdue, parseDueDate, relativeDue } from "@/lib/due-date";
import type { HomeSummaryIssue } from "@/lib/types";

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
  projectKey,
}: {
  issue: HomeSummaryIssue;
  projectKey: string;
}) {
  const t = useTranslations("Home");
  const due = parseDueDate(issue.due_date);
  const overdue = due !== null && isDueDateOverdue(due);

  return (
    // Même destination que l'aperçu du cycle : le board cross-projet ouvre le
    // panneau du ticket (components/global-board.tsx consomme ?issue=).
    <Link
      href={`/all?issue=${issue.id}`}
      className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
    >
      <StatusIndicator status={issue.status} className="size-4" />
      {projectKey ? (
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {issueIdentifier(projectKey, issue.number)}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-sm text-foreground/90 group-hover:text-foreground">
        {issue.title}
      </span>
      {issue.effort ? (
        <EffortIndicator effort={issue.effort} className="shrink-0" />
      ) : null}
      {due ? (
        <span
          className={cn(
            "shrink-0 text-xs",
            overdue ? "font-medium text-destructive" : "text-muted-foreground",
          )}
          title={overdue ? t("dueSoonOverdue") : undefined}
        >
          <RelativeDueLabel due={due} />
        </span>
      ) : null}
    </Link>
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
 * Rien à montrer → rien du tout, comme HomeFeedbackSection : un tableau de bord
 * ne garde pas de place pour un état vide.
 */
export function HomeDueSoonSection() {
  const t = useTranslations("Home");
  const { dueSoon, loading } = useHomeSummaryQuery();
  const { projects } = useProjects();

  const projectKeyById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.key])),
    [projects],
  );

  // Pas de squelette pendant le chargement : la section est le plus souvent
  // vide, et un bloc qui apparaît pour disparaître aussitôt secouerait la page à
  // chaque visite. Les cartes du dessus, elles, portent déjà l'attente.
  if (loading || dueSoon.length === 0) return null;

  const rows = dueSoon.slice(0, ROWS_SHOWN);
  const overflow = dueSoon.length - rows.length;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-tight">{t("dueSoonTitle")}</h2>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {rows.map((issue) => (
          <DueSoonRow
            key={issue.id}
            issue={issue}
            projectKey={projectKeyById.get(issue.project_id) ?? ""}
          />
        ))}
        {overflow > 0 && (
          <p className="px-4 py-2 text-xs text-muted-foreground">
            {t("dueSoonMore", { count: overflow })}
          </p>
        )}
      </div>
    </section>
  );
}
