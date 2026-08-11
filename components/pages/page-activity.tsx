"use client";

// L'ACTIVITÉ d'une page (MIN-278) — qui est passé, et ce qu'il a fait.
//
// À côté de l'historique et pas à sa place : les deux répondent à des questions
// différentes, et confondre les deux les rendrait tous deux confus.
//
//   • l'HISTORIQUE (MIN-277) rend les ÉTATS. On y va pour lire ce que la page
//     disait avant, et pour l'y remettre. Il ne connaît que le corps.
//   • l'ACTIVITÉ rend les GESTES. Elle porte ce qu'aucun état ne porte : la
//     création, la mise à la corbeille, la restauration — et un renommage, qui
//     ne laisse aucune version derrière lui.
//
// D'où le rendu par `IssueActivity`, celui d'un ticket et d'un objectif, et non
// une liste de plus : c'est la même table (`issue_events`), donc les mêmes
// visages d'acteurs, les mêmes regroupements, le même vocabulaire — un geste de
// Numo se reconnaît ici comme il se reconnaît là-bas. Et le jour où une page se
// commentera (MIN-282), le fil s'y insérera sans rien réécrire : `IssueActivity`
// mêle déjà commentaires et événements.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Spinner } from "mangue-ui";
import { useTranslations } from "next-intl";

import { fetchPageEventsApi } from "@/lib/pages-api";
import { useMembersQuery } from "@/lib/use-members-query";
import { IssueActivity } from "@/components/issue-timeline";
import type { EventContext } from "@/lib/describe-event";
import type { TimelineItem } from "@/lib/use-issue-timeline";

/** La clé de cache du journal d'une page — celle qu'invalide le pont temps réel. */
export const pageEventsKey = (pageId: string) =>
  ["page-events", pageId] as const;

export function PageActivity({
  projectId,
  pageId,
  currentUserId,
  enabled = true,
}: {
  projectId: string;
  pageId: string;
  currentUserId: string | null;
  /** Le panneau est fermé : rien à charger tant qu'on ne le regarde pas. */
  enabled?: boolean;
}) {
  const t = useTranslations("Pages");
  const { members } = useMembersQuery(projectId, enabled);

  const events = useQuery({
    queryKey: pageEventsKey(pageId),
    queryFn: () => fetchPageEventsApi(projectId, pageId),
    enabled,
    // Comme l'historique : le journal bouge à chaque écriture, la sienne comme
    // celle d'un autre. On le redemande à l'ouverture plutôt que de peindre un
    // cache de la fois d'avant.
    refetchOnMount: "always",
    staleTime: 0,
  });

  const items = useMemo<TimelineItem[]>(
    () =>
      (events.data ?? []).map((event) => ({
        kind: "event" as const,
        at: event.created_at,
        event,
      })),
    [events.data]
  );

  // Une page n'a ni objectif, ni catégorie, ni ticket à nommer : seuls les
  // MEMBRES servent, pour résoudre l'acteur de chaque ligne. Le reste du
  // contexte est vide plutôt qu'absent — `EventContext` est partagé avec les
  // trois autres surfaces, et le remplir de listes vides coûte moins qu'un
  // second type à tenir en phase.
  const ctx = useMemo<EventContext>(
    () => ({
      members,
      objectives: [],
      categories: [],
      issues: [],
      projectKey: "",
    }),
    [members]
  );

  if (events.isPending) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="size-4 text-muted-foreground" />
      </div>
    );
  }
  if (events.error) {
    return (
      <p className="px-1 py-6 text-xs text-muted-foreground">
        {t("activityLoadFailed")}
      </p>
    );
  }

  return (
    <IssueActivity
      items={items}
      ctx={ctx}
      entity="page"
      currentUserId={currentUserId}
      projectId={projectId}
      // Une page ne se commente pas encore (MIN-282) : le fil ne contient que
      // des événements, donc aucune de ces quatre fonctions n'est atteignable.
      // Elles sont là parce que `IssueActivity` les demande — et le jour où le
      // fil arrivera, c'est ici qu'il se branchera.
      onReply={async () => {}}
      onEditComment={async () => {}}
      onDeleteComment={async () => {}}
      onDeleteAttachment={async () => {}}
    />
  );
}
