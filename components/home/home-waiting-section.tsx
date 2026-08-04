"use client";

import { useMemo, type ReactNode } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { GitPullRequest, MessageCircleQuestion, Sparkles } from "lucide-react";
import { useAllPullRequestsQuery, useAgentSessionsQuery } from "@/lib/use-agent-runs";
import { useAgentReads } from "@/lib/use-agent-reads";
import { isAgentSessionUnread } from "@/lib/agent-api";
import { issueIdentifier } from "@/lib/issue-constants";
import type { MessageKey } from "@/lib/i18n-keys";
import {
  HomeLead,
  HomeMore,
  HomeRow,
  HomeSection,
  type HomeRowProject,
} from "@/components/home/home-list";

/** Combien de lignes la section montre avant de compter le reste. */
const ROWS_SHOWN = 5;

/**
 * Ce que la section réunit, du plus bloquant au moins bloquant. L'ordre de ce
 * tableau EST l'ordre d'affichage ; l'âge ne départage que deux items de même
 * nature.
 *
 * Il y avait une quatrième nature, « ticket en relecture ». Elle est partie : un
 * ticket du cycle laissé en relecture s'affichait ici ET dans la section du
 * cycle, à deux lignes d'écart, avec son statut pour seule différence. La
 * section ne parle donc plus que de ce que la MACHINE a produit et qui attend un
 * humain — une question de l'agent, un agent qui a fini, une PR ouverte. Ce que
 * deviennent les tickets se lit dans les sections qui listent des tickets.
 */
const KIND_ORDER = ["agentAsk", "pr", "agentDone"] as const;
type WaitingKind = (typeof KIND_ORDER)[number];

const KIND_LABEL: Record<WaitingKind, MessageKey<"Home">> = {
  agentAsk: "waitingKindAgentAsk",
  pr: "waitingKindPr",
  agentDone: "waitingKindAgentDone",
};

interface WaitingItem {
  id: string;
  kind: WaitingKind;
  href: string;
  icon: ReactNode;
  /** Identifiant du ticket, numéro de PR. */
  lead: ReactNode;
  title: string;
  project: HomeRowProject | undefined;
  /** Depuis quand ça attend — la seule mesure commune aux trois natures. */
  at: string;
}

/**
 * Section « En attente de moi » de l'accueil.
 *
 * Chaque ligne est un travail arrêté qui ne repartira pas tout seul — une
 * session d'agent qui pose une question ou qui a fini sans qu'on l'ait rouverte,
 * une PR ouverte à relire — et mène à l'endroit exact où on le débloque.
 *
 * Les deux sources sont déjà montées par l'app-shell (badges de la sidebar) : la
 * section ne déclenche aucune requête à elle. Rien n'attend → rien du tout,
 * comme les autres files de la page : un tableau de bord ne garde pas de place
 * pour un état vide, et sur un compte sans agent c'est l'état permanent.
 */
export function HomeWaitingSection() {
  const t = useTranslations("Home");
  const { pullRequests, loading } = useAllPullRequestsQuery();
  const { sessions } = useAgentSessionsQuery();
  const { reads } = useAgentReads();
  const now = useNow({ updateInterval: 60_000 });
  const format = useFormatter();

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
          <HomeLead>{issueIdentifier(session.project.key, session.issue.number)}</HomeLead>
        ) : null,
        title: session.issue.title,
        project: session.project ?? undefined,
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
          <HomeLead>
            {pr.provider === "gitlab" ? `!${pr.pr_number}` : `#${pr.pr_number}`}
          </HomeLead>
        ),
        title: pr.title ?? pr.issue?.title ?? "",
        project: pr.project ?? undefined,
        at: pr.updated_at,
      });
    }

    // Par nature d'abord, puis par ancienneté : ce qui attend depuis le plus
    // longtemps remonte dans son groupe.
    return list.sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        a.at.localeCompare(b.at),
    );
  }, [sessions, reads, pullRequests]);

  // Pas de squelette : la section est vide le plus souvent, et un bloc qui
  // apparaît pour disparaître aussitôt secouerait la page à chaque visite.
  if (loading || items.length === 0) return null;

  const rows = items.slice(0, ROWS_SHOWN);
  const overflow = items.length - rows.length;

  return (
    <HomeSection title={t("waitingTitle")} count={items.length}>
      {rows.map((item) => (
        <HomeRow
          key={item.id}
          href={item.href}
          icon={item.icon}
          kind={t(KIND_LABEL[item.kind])}
          lead={item.lead}
          title={item.title}
          project={item.project}
          right={
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {format.relativeTime(new Date(item.at), now)}
            </span>
          }
        />
      ))}
      {overflow > 0 && <HomeMore>{t("waitingMore", { count: overflow })}</HomeMore>}
    </HomeSection>
  );
}
