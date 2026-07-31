"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Skeleton } from "mangue-ui";
import { CircleCheck, GitPullRequest, MessageCircleQuestion, Sparkles } from "lucide-react";
import { useHomeSummaryQuery } from "@/lib/use-home-summary-query";
import { useAllPullRequestsQuery, useAgentSessionsQuery } from "@/lib/use-agent-runs";
import { useAgentReads } from "@/lib/use-agent-reads";
import { isAgentSessionUnread } from "@/lib/agent-api";
import { useProjects } from "@/lib/projects-context";
import { StatusIndicator } from "@/components/issue-indicators";
import { issueIdentifier } from "@/lib/issue-constants";
import type { MessageKey } from "@/lib/i18n-keys";

/** Combien de lignes tiennent dans la carte, à côté de celle du cycle. */
const ROWS_SHOWN = 4;

/**
 * Ce que la carte sait réunir, du plus bloquant au moins bloquant. L'ordre de ce
 * tableau EST l'ordre d'affichage : une conversation d'agent en suspens ne vaut
 * pas un ticket qui dort en relecture, et c'est la seule hiérarchie qui compte
 * ici — l'âge ne départage que deux items de même nature.
 */
const KIND_ORDER = ["agentAsk", "pr", "agentDone", "review"] as const;
type WaitingKind = (typeof KIND_ORDER)[number];

const KIND_LABEL: Record<WaitingKind, MessageKey<"Home">> = {
  agentAsk: "waitingKindAgentAsk",
  pr: "waitingKindPr",
  agentDone: "waitingKindAgentDone",
  review: "waitingKindReview",
};

interface WaitingItem {
  id: string;
  kind: WaitingKind;
  href: string;
  icon: ReactNode;
  /** Colonne de gauche : identifiant du ticket, numéro de PR. */
  lead: ReactNode;
  title: string;
  /** Depuis quand ça attend — la seule mesure commune aux quatre natures. */
  at: string;
}

function WaitingRow({ item, now }: { item: WaitingItem; now: Date }) {
  const t = useTranslations("Home");
  const format = useFormatter();
  const kind = t(KIND_LABEL[item.kind]);

  return (
    <Link
      href={item.href}
      className="group -mx-1.5 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-muted/40"
    >
      <span className="flex shrink-0 items-center" title={kind}>
        {item.icon}
        <span className="sr-only">{kind}</span>
      </span>
      {item.lead}
      <span className="min-w-0 flex-1 truncate text-foreground/90 group-hover:text-foreground">
        {item.title}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {format.relativeTime(new Date(item.at), now)}
      </span>
    </Link>
  );
}

const Mono = ({ children }: { children: ReactNode }) => (
  <span className="shrink-0 font-mono text-xs text-muted-foreground">{children}</span>
);

/**
 * Carte « En attente de moi » de l'accueil.
 *
 * Elle remplace la vue globale, qui n'alignait que trois compteurs : savoir
 * qu'on a 42 tickets ouverts ne dit pas quoi faire, et un nombre ne se clique
 * pas. Ici chaque ligne est un travail arrêté qui ne repartira pas tout seul —
 * une PR de Numo à relire, une session d'agent qui pose une question ou qui a
 * fini sans qu'on l'ait rouverte, un ticket laissé en relecture — et chaque
 * ligne mène à l'endroit exact où on le débloque.
 *
 * Les trois sources sont déjà montées par l'app-shell (badges de la sidebar) et
 * la quatrième arrive avec le reste du tableau de bord : la carte ne déclenche
 * aucune requête à elle.
 */
export function HomeWaitingCard() {
  const t = useTranslations("Home");
  const { inReview, inReviewTotal, loading } = useHomeSummaryQuery();
  const { pullRequests, loading: prLoading } = useAllPullRequestsQuery();
  const { sessions } = useAgentSessionsQuery();
  const { reads } = useAgentReads();
  const { projects } = useProjects();
  const now = useNow({ updateInterval: 60_000 });

  const projectKeyById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.key])),
    [projects],
  );

  const items = useMemo<WaitingItem[]>(() => {
    const list: WaitingItem[] = [];

    // Sessions d'agent : même lecture que la pastille de la sidebar — une session
    // ne compte que si elle n'a pas été rouverte depuis qu'elle a fini. Celles
    // qui TRAVAILLENT n'attendent rien de personne et n'entrent pas ici.
    for (const session of sessions) {
      if (!session.issue || !isAgentSessionUnread(session, reads)) continue;
      list.push({
        id: `agent-${session.runId}`,
        kind: session.awaitingInput ? "agentAsk" : "agentDone",
        href: `/agents?issue=${session.issue.id}`,
        icon: session.awaitingInput ? (
          <MessageCircleQuestion className="size-4 text-amber-500" />
        ) : (
          <Sparkles className="size-4 text-muted-foreground" />
        ),
        lead: session.project ? (
          <Mono>{issueIdentifier(session.project.key, session.issue.number)}</Mono>
        ) : null,
        title: session.issue.title,
        at: session.lastCompletedAt ?? session.updated_at,
      });
    }

    // PR ouvertes : la query est déjà filtrée côté serveur (open + draft), même
    // défaut que la page et que le badge de la sidebar.
    for (const pr of pullRequests) {
      // Numo est en train de la retravailler : elle n'attend pas après nous.
      if (pr.activeRunId) continue;
      list.push({
        id: `pr-${pr.prId}`,
        kind: "pr",
        href: `/pull-requests?pr=${pr.prId}`,
        icon: <GitPullRequest className="size-4 text-muted-foreground" />,
        lead: (
          <Mono>{pr.provider === "gitlab" ? `!${pr.pr_number}` : `#${pr.pr_number}`}</Mono>
        ),
        title: pr.title ?? pr.issue?.title ?? "",
        at: pr.updated_at,
      });
    }

    for (const issue of inReview) {
      const key = projectKeyById.get(issue.project_id);
      list.push({
        id: `review-${issue.id}`,
        kind: "review",
        // Même destination que les autres aperçus de l'accueil : le board
        // cross-projet, panneau du ticket ouvert.
        href: `/all?issue=${issue.id}`,
        icon: <StatusIndicator status="in_review" className="size-4" />,
        lead: key ? <Mono>{issueIdentifier(key, issue.number)}</Mono> : null,
        title: issue.title,
        at: issue.updated_at,
      });
    }

    // Par nature d'abord, puis par ancienneté : ce qui attend depuis le plus
    // longtemps remonte dans son groupe.
    return list.sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        a.at.localeCompare(b.at),
    );
  }, [sessions, reads, pullRequests, inReview, projectKeyById]);

  const heading = (
    <h2 className="text-sm font-semibold tracking-tight">{t("waitingTitle")}</h2>
  );

  return (
    <section className="flex h-full min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-5 text-card-foreground">
      <div className="flex items-center gap-2">
        {heading}
        {items.length > 0 && (
          <span className="text-sm tabular-nums text-muted-foreground">
            {/* Le total compte aussi la relecture laissée hors du plafond
                serveur : le nombre reste juste quand la liste, elle, est courte. */}
            {items.length - inReview.length + inReviewTotal}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-0.5">
        {loading || prLoading ? (
          <>
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-40" />
          </>
        ) : items.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheck className="size-4 shrink-0" />
            {t("waitingEmpty")}
          </div>
        ) : (
          items
            .slice(0, ROWS_SHOWN)
            .map((item) => <WaitingRow key={item.id} item={item} now={now} />)
        )}
      </div>

      {items.length > ROWS_SHOWN && (
        <p className="text-xs text-muted-foreground">
          {t("waitingMore", {
            count: items.length - ROWS_SHOWN - inReview.length + inReviewTotal,
          })}
        </p>
      )}
    </section>
  );
}
