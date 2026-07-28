"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { ChevronUp, MessagesSquare } from "lucide-react";
import { useHomeSummaryQuery } from "@/lib/use-home-summary-query";
import { useProjects } from "@/lib/projects-context";
import { StatusIndicator } from "@/components/issue-indicators";
import { ProjectOrb } from "@/components/project-orb";
import { issueIdentifier } from "@/lib/issue-constants";
import type { Project } from "@/lib/types";

/** Plafond dur de la section : l'accueil est un tableau de bord, pas la file de
    triage. Le reste est annoncé en clair (« +N autres »). */
const MAX_ROWS = 10;

/**
 * Combien de projets au plus se partagent ces lignes. Sans ce plafond, un compte
 * à six projets remplirait la section d'un échantillon de chacun, et on ne
 * saurait plus par où commencer : là, la section montre les deux projets dont
 * l'attente est la plus vieille, et compte le reste.
 */
const MAX_PROJECTS = 2;

/**
 * Part minimale réservée aux retours quand il y en a. Un triage en retard est
 * toujours plus vieux qu'un retour du jour : sans ce plancher, il prendrait les
 * dix lignes et le feedback resterait invisible — exactement le défaut que
 * MIN-104 corrige.
 */
const MIN_FEEDBACK_ROWS = 3;

/** Une rangée de la file : mêmes colonnes pour un ticket et pour un retour, afin
    que l'œil descende la liste sans se réaligner. */
function QueueRow({
  href,
  icon,
  kind,
  lead,
  title,
  project,
  at,
  now,
}: {
  href: string;
  icon: ReactNode;
  /** Nature de la ligne, pour les lecteurs d'écran : l'icône seule la dit à l'œil. */
  kind: string;
  /** Identifiant du ticket, ou compte de voix du retour — la même colonne. */
  lead: ReactNode;
  title: string;
  /** Absent le temps que la liste des projets arrive : la ligne reste lisible. */
  project: Project | undefined;
  at: string;
  now: Date;
}) {
  const format = useFormatter();

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
    >
      <span className="flex shrink-0 items-center" title={kind}>
        {icon}
        <span className="sr-only">{kind}</span>
      </span>
      {lead}
      <span className="min-w-0 flex-1 truncate text-sm text-foreground/90 group-hover:text-foreground">
        {title}
      </span>
      {project ? (
        // Le projet, nommé sur chaque ligne — c'est ce qui manquait à l'ancien
        // indicateur, perdu au coin d'une carte. Sous `sm` il ne reste que
        // l'orbe : la même identité colorée que dans la grille de projets.
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <ProjectOrb
            seed={project.id}
            iconUrl={project.icon_url}
            className="size-4 rounded-[5px]"
          />
          <span className="hidden max-w-[9rem] truncate sm:inline">{project.name}</span>
        </span>
      ) : null}
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {format.relativeTime(new Date(at), now)}
      </span>
    </Link>
  );
}

/**
 * Section « À trier » de l'accueil (MIN-104) — tout ce qui attend une décision,
 * tickets en triage et retours non tranchés, avec le projet nommé sur chaque
 * ligne.
 *
 * Elle remplace l'ancienne section Feedback, qui ne disait qu'un compte par
 * projet, et rend visible ce que les cartes de projet ne portaient que comme un
 * `Stat` de plus dans un coin. Les deux listes viennent de GET /api/me/summary
 * (une requête, `triage` + `newFeedback`) — l'ancienne section éventaillait un
 * appel `feedback/counts` par projet.
 *
 * Rien à trier → rien du tout, comme les échéances proches : un tableau de bord
 * ne garde pas de place pour un état vide.
 */
export function HomeTriageSection() {
  const t = useTranslations("Home");
  const tIssue = useTranslations("Issue");
  const { triage, triageTotal, newFeedback, newFeedbackTotal, loading } =
    useHomeSummaryQuery();
  const { projects } = useProjects();
  // Une seule horloge pour toute la section, rafraîchie à la minute : les âges
  // affichés se comptent en heures et en jours.
  const now = useNow({ updateInterval: 60_000 });

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  // Les projets qui ont droit aux lignes : ceux dont un item attend depuis le
  // plus longtemps, MAX_PROJECTS au plus. Les deux listes arrivent déjà triées du
  // plus ancien au plus récent, il ne reste qu'à les fusionner sur la date.
  const shownProjectIds = useMemo(() => {
    const queue = [...triage, ...newFeedback].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
    const ids = new Set<string>();
    for (const item of queue) {
      ids.add(item.project_id);
      if (ids.size === MAX_PROJECTS) break;
    }
    return ids;
  }, [triage, newFeedback]);

  // Pas de squelette : la section est vide le plus souvent, et un bloc qui
  // apparaît pour disparaître aussitôt secouerait la page à chaque visite.
  if (loading || triageTotal + newFeedbackTotal === 0) return null;

  const issues = triage.filter((i) => shownProjectIds.has(i.project_id));
  const posts = newFeedback.filter((p) => shownProjectIds.has(p.project_id));

  // Les dix lignes se partagent au bénéfice du plus ancien, sauf le plancher
  // laissé aux retours. Les « +N autres » comptent TOUT ce qui n'est pas montré,
  // y compris ce qui dort dans les projets écartés : les totaux viennent de
  // `count` SQL, ils restent exacts.
  const postRows = posts.slice(
    0,
    Math.max(MAX_ROWS - issues.length, MIN_FEEDBACK_ROWS),
  );
  const issueRows = issues.slice(0, MAX_ROWS - postRows.length);
  const moreIssues = triageTotal - issueRows.length;
  const morePosts = newFeedbackTotal - postRows.length;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold tracking-tight">{t("triageTitle")}</h2>
        <span className="text-sm tabular-nums text-muted-foreground">
          {triageTotal + newFeedbackTotal}
        </span>
      </div>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {issueRows.map((issue) => {
          const project = projectById.get(issue.project_id);
          return (
            <QueueRow
              key={issue.id}
              // Le triage est le geste qu'on vient faire : la page ouvre le
              // ticket cliqué (?issue=) au lieu du premier de sa liste.
              href={`/projects/${issue.project_id}/triage?issue=${issue.id}`}
              icon={<StatusIndicator status="triage" className="size-4" />}
              kind={tIssue("entity")}
              lead={
                project ? (
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {issueIdentifier(project.key, issue.number)}
                  </span>
                ) : null
              }
              title={issue.title}
              project={project}
              at={issue.created_at}
              now={now}
            />
          );
        })}
        {moreIssues > 0 && (
          <p className="px-4 py-2 text-xs text-muted-foreground">
            {t("triageMoreIssues", { count: moreIssues })}
          </p>
        )}

        {postRows.map((post) => (
          <QueueRow
            key={post.id}
            href={`/projects/${post.project_id}/feedback?post=${post.id}`}
            icon={<MessagesSquare className="size-4 text-muted-foreground" />}
            kind={t("triageKindFeedback")}
            lead={
              <span
                className="flex shrink-0 items-center gap-0.5 text-xs tabular-nums text-muted-foreground"
                title={t("triageVotes", { count: post.vote_count })}
              >
                <ChevronUp className="size-3.5" />
                {post.vote_count}
              </span>
            }
            title={post.title}
            project={projectById.get(post.project_id)}
            at={post.created_at}
            now={now}
          />
        ))}
        {morePosts > 0 && (
          <p className="px-4 py-2 text-xs text-muted-foreground">
            {t("triageMoreFeedback", { count: morePosts })}
          </p>
        )}
      </div>
    </section>
  );
}
