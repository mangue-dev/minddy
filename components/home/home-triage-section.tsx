"use client";

import { useMemo } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { ChevronUp, MessagesSquare } from "lucide-react";
import { useHomeSummaryQuery } from "@/lib/use-home-summary-query";
import { useProjects } from "@/lib/projects-context";
import { StatusIndicator } from "@/components/issue-indicators";
import { issueIdentifier } from "@/lib/issue-constants";
import {
  HomeLead,
  HomeMore,
  HomeRow,
  HomeSection,
} from "@/components/home/home-list";

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

/**
 * Section « À trier » de l'accueil (MIN-104) — tout ce qui attend une décision,
 * tickets en triage et retours non tranchés, avec le projet nommé sur chaque
 * ligne.
 *
 * Les deux listes viennent de GET /api/me/summary (une requête, `triage` +
 * `newFeedback`) — l'ancienne section éventaillait un appel `feedback/counts`
 * par projet.
 *
 * Rien à trier → rien du tout, comme les autres files de la page.
 */
export function HomeTriageSection() {
  const t = useTranslations("Home");
  const tIssue = useTranslations("Issue");
  const format = useFormatter();
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
  const postRows = posts.slice(0, Math.max(MAX_ROWS - issues.length, MIN_FEEDBACK_ROWS));
  const issueRows = issues.slice(0, MAX_ROWS - postRows.length);
  const moreIssues = triageTotal - issueRows.length;
  const morePosts = newFeedbackTotal - postRows.length;

  const age = (at: string) => (
    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
      {format.relativeTime(new Date(at), now)}
    </span>
  );

  return (
    <HomeSection title={t("triageTitle")} count={triageTotal + newFeedbackTotal}>
      {issueRows.map((issue) => {
        const project = projectById.get(issue.project_id);
        return (
          <HomeRow
            key={issue.id}
            // Le triage est le geste qu'on vient faire : la page ouvre le ticket
            // cliqué (?issue=) au lieu du premier de sa liste.
            href={`/projects/${issue.project_id}/triage?issue=${issue.id}`}
            icon={<StatusIndicator status="triage" className="size-4" />}
            kind={tIssue("entity")}
            lead={
              project ? (
                <HomeLead>{issueIdentifier(project.key, issue.number)}</HomeLead>
              ) : null
            }
            title={issue.title}
            project={project}
            right={age(issue.created_at)}
          />
        );
      })}
      {moreIssues > 0 && <HomeMore>{t("triageMoreIssues", { count: moreIssues })}</HomeMore>}

      {postRows.map((post) => (
        <HomeRow
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
          right={age(post.created_at)}
        />
      ))}
      {morePosts > 0 && (
        <HomeMore>{t("triageMoreFeedback", { count: morePosts })}</HomeMore>
      )}
    </HomeSection>
  );
}
