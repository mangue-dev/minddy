"use client";

// L'ACTIVITÉ d'une page (MIN-278, MIN-282) — qui est passé, ce qu'il a fait, et
// ce qui s'est dit.
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
// Numo se reconnaît ici comme il se reconnaît là-bas.
//
// ─── Le fil de la PAGE vit ici (MIN-282) ────────────────────────────────────
//
// Un commentaire qui parle du document ENTIER est un geste de plus sur la page,
// au même titre qu'un renommage ou qu'une restauration : il se lit dans la même
// colonne, à sa date, et `IssueActivity` mêle déjà messages et événements. Une
// section sous le document aurait fait de la page un fil de discussion, ce
// qu'elle n'est pas — on ouvre une page pour la LIRE.
//
// Ce qui n'est PAS ici : les fils ancrés à un bloc et toujours vivants. Ceux-là
// se lisent à côté de leur texte (components/pages/page-comment-popover.tsx) —
// c'est toute la raison de l'ancre. Un fil DÉTACHÉ, lui, revient ici : son bloc
// n'existe plus, la page n'a plus aucun endroit où le montrer, et il porte
// l'extrait qui dit de quoi il parlait.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Spinner, cn } from "mangue-ui";
import { useTranslations } from "next-intl";
import { Link2Off } from "lucide-react";

import { fetchPageApi, fetchPageEventsApi } from "@/lib/pages-api";
import { pageKey } from "@/lib/use-pages-query";
import { pageBlockTexts } from "@/lib/pages-mentions";
import { useMembersQuery } from "@/lib/use-members-query";
import { IssueActivity, CommentComposer } from "@/components/issue-timeline";
import type { ActivityItem, ThreadMessage } from "@/components/issue-timeline";
import { usePageComments } from "@/lib/use-page-comments";
import type { PageThread } from "@/lib/page-comments";
import type { EventContext } from "@/lib/describe-event";

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

  /**
   * Les blocs du document, lus dans le CORPS et non dans un éditeur : cet
   * onglet vit dans un panneau, il ne monte pas tiptap. C'est la même règle de
   * granularité que partout ailleurs (`pageBlockTexts`, premier niveau), et le
   * cache est celui que la page a déjà rempli en s'ouvrant.
   *
   * Sans ça, tout fil ancré passerait pour détaché ici et se lirait DEUX fois —
   * à côté de son bloc, et dans cette colonne.
   */
  const page = useQuery({
    queryKey: pageKey(pageId),
    queryFn: () => fetchPageApi(projectId, pageId),
    enabled,
  });
  const blockIds = useMemo(
    () =>
      new Set(
        pageBlockTexts(page.data?.content ?? null)
          .map((block) => block.blockId)
          .filter((id): id is string => !!id)
      ),
    [page.data]
  );

  const { threads, edit, remove, add } = usePageComments({
    projectId,
    pageId,
    blockIds,
  });

  /**
   * Ce que cette colonne montre — deux cas, un seul principe : un fil s'affiche
   * ici quand la PAGE n'a nulle part ailleurs où le montrer.
   *
   *  • le fil de la page : il ne parle d'aucun bloc ;
   *  • un fil DÉTACHÉ : son bloc est parti, et il porte l'extrait qui dit de
   *    quoi il parlait.
   *
   * Un fil ancré et vivant reste sur son texte : c'est toute la raison de
   * l'ancre, et le montrer deux fois ferait douter que ce soit le même.
   */
  const shown = useMemo(
    () => threads.filter((thread) => !thread.root.block_id || thread.detached),
    [threads]
  );

  const items = useMemo<ActivityItem[]>(() => {
    const merged: ActivityItem[] = [
      ...(events.data ?? []).map((event) => ({
        kind: "event" as const,
        at: event.created_at,
        event,
      })),
      ...shown.map((thread) => ({
        kind: "comment" as const,
        at: thread.root.created_at,
        comment: thread.root as ThreadMessage,
        replies: thread.replies as ThreadMessage[],
      })),
    ];
    merged.sort((a, b) => a.at.localeCompare(b.at));
    return merged;
  }, [events.data, shown]);

  const byId = useMemo(
    () => new Map(shown.map((thread) => [thread.root.id, thread])),
    [shown]
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
    <div className="flex flex-col gap-4">
      <IssueActivity
        items={items}
        ctx={ctx}
        entity="page"
        currentUserId={currentUserId}
        projectId={projectId}
        allowAttachments={false}
        commentHeader={(comment) => {
          const thread = byId.get(comment.id);
          return thread ? <ThreadHeader thread={thread} /> : null;
        }}
        onReply={(parentId, body, mentionedUserIds) =>
          add({ body, parentId, mentionedUserIds })
        }
        onEditComment={edit}
        onDeleteComment={remove}
        // Un fil de page n'a pas de pièce jointe : le crochet existe pour la
        // signature partagée, et n'est jamais atteignable.
        onDeleteAttachment={async () => {}}
      />
    </div>
  );
}

/**
 * COMMENTER la page — le composeur, en PIED de panneau et non en bout de liste.
 *
 * Il est fixe : on écrit un commentaire après avoir lu, donc après avoir fait
 * défiler, et un champ qui s'éloigne à mesure qu'on lit est un champ qu'il faut
 * aller rechercher. C'est déjà la règle du panneau d'un ticket, dont le
 * composeur vit dans `SidePanelFooter`.
 *
 * Il est monté À CÔTÉ de la liste, pas dedans, et lit le même cache : une
 * seule requête pour les deux (react-query la partage sur `["page-comments",
 * pageId]`), et l'écriture invalide la clé que la liste écoute.
 */
export function PageCommentBar({
  projectId,
  pageId,
}: {
  projectId: string;
  pageId: string;
}) {
  const t = useTranslations("Pages");
  const tTimeline = useTranslations("Timeline");
  const { members } = useMembersQuery(projectId, true);
  const { add } = usePageComments({ projectId, pageId, blockIds: NO_BLOCKS });

  return (
    <CommentComposer
      members={members}
      projectId={projectId}
      allowAttachments={false}
      placeholder={t("commentPagePlaceholder")}
      submitLabel={tTimeline("comment")}
      onSubmit={(body, mentionedUserIds) => add({ body, mentionedUserIds })}
    />
  );
}

/** Le composeur n'a que faire des ancres : il n'écrit que des commentaires de
    PAGE, et ne lit aucun fil. L'ensemble vide évite de refabriquer un Set à
    chaque rendu pour rien. */
const NO_BLOCKS: ReadonlySet<string> = new Set<string>();

/** Le bandeau d'un fil : ce dont il parle, et ce que son ancre est devenue. */
function ThreadHeader({ thread }: { thread: PageThread }) {
  const t = useTranslations("Pages");
  const { root, detached } = thread;

  return (
    <div className="min-w-0">
      {/* Le fil parle d'un texte que plus personne ne voit : le dire, et montrer
          l'extrait, est la seule trace de pourquoi le bloc a été retiré. */}
      {detached && (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-500">
          <Link2Off className="size-3.5" />
          {t("commentDetached")}
        </span>
      )}
      {root.block_id ? (
        <p
          className={cn(
            "border-l-2 border-brand/50 pl-2 text-xs italic text-muted-foreground line-clamp-2",
            detached && "mt-1"
          )}
        >
          {root.quote ?? t("commentOnBlock")}
        </p>
      ) : (
        <span className="text-xs text-muted-foreground">{t("commentOnPage")}</span>
      )}
    </div>
  );
}
