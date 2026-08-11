"use client";

// Le fil d'une page, côté client (MIN-282).
//
// Une seule requête — le fil ENTIER — et tout le reste est du calcul : l'ordre,
// le détachement, le masquage des fils résolus vivent dans lib/page-comments.ts,
// qui ne sait rien du réseau. Ce module ne fait que brancher les deux, et les
// écritures qui les font bouger.
//
// Le TEMPS RÉEL ne passe pas par ici : le pont (lib/realtime-provider.tsx)
// invalide `["page-comments", pageId]` sur toute écriture diffusée par le topic
// du projet. Pas de canal par page — la présence de page passe déjà par le
// topic du projet, en ouvrir un second doublerait les abonnements pour la même
// information.

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addPageCommentApi,
  deletePageCommentApi,
  fetchPageCommentsApi,
  resolvePageThreadApi,
  updatePageCommentApi,
} from "@/lib/pages-api";
import {
  arrangeThreads,
  commentedBlockIds,
  resolvedCount,
  type PageComment,
  type PageThread,
} from "@/lib/page-comments";

export const pageCommentsKey = (pageId: string) =>
  ["page-comments", pageId] as const;

export interface PageCommentsHandle {
  comments: PageComment[];
  /** Les fils VISIBLES, ordonnés — détachés en tête. */
  threads: PageThread[];
  /** Les blocs qui portent un fil ouvert : ce que peint le liseré. */
  commentedBlocks: Set<string>;
  /** Combien de fils résolus sont cachés (0 quand on les montre). */
  hiddenResolved: number;
  loading: boolean;
  add: (input: {
    body: string;
    blockId?: string | null;
    quote?: string | null;
    parentId?: string | null;
    mentionedUserIds?: string[];
  }) => Promise<void>;
  edit: (commentId: string, body: string) => Promise<void>;
  remove: (commentId: string) => Promise<void>;
  resolve: (commentId: string, resolved: boolean) => Promise<void>;
}

export function usePageComments({
  projectId,
  pageId,
  /** Les ids de blocs du document TEL QU'IL EST À L'ÉCRAN — c'est lui, et pas
      la dernière sauvegarde, qui décide de ce qui est détaché. */
  blockIds,
  showResolved = false,
}: {
  projectId: string;
  pageId: string;
  blockIds: ReadonlySet<string>;
  showResolved?: boolean;
}): PageCommentsHandle {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: pageCommentsKey(pageId),
    queryFn: () => fetchPageCommentsApi(projectId, pageId),
  });
  const comments = useMemo(() => data ?? [], [data]);

  const threads = useMemo(
    () => arrangeThreads(comments, blockIds, { includeResolved: showResolved }),
    [comments, blockIds, showResolved]
  );
  const commentedBlocks = useMemo(
    // Sur la liste COMPLÈTE : le liseré ne dépend pas de ce que l'on a choisi
    // d'afficher sous le document, et un fil résolu n'allume rien de toute
    // façon (cf. `commentedBlockIds`).
    () => commentedBlockIds(arrangeThreads(comments, blockIds, { includeResolved: true })),
    [comments, blockIds]
  );
  const hiddenResolved = useMemo(
    () => (showResolved ? 0 : resolvedCount(comments, blockIds)),
    [comments, blockIds, showResolved]
  );

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: pageCommentsKey(pageId) });
  }, [queryClient, pageId]);

  const add = useCallback<PageCommentsHandle["add"]>(
    async (input) => {
      await addPageCommentApi(projectId, pageId, input);
      refresh();
    },
    [projectId, pageId, refresh]
  );
  const edit = useCallback<PageCommentsHandle["edit"]>(
    async (commentId, body) => {
      await updatePageCommentApi(projectId, pageId, commentId, body);
      refresh();
    },
    [projectId, pageId, refresh]
  );
  const remove = useCallback<PageCommentsHandle["remove"]>(
    async (commentId) => {
      await deletePageCommentApi(projectId, pageId, commentId);
      refresh();
    },
    [projectId, pageId, refresh]
  );
  const resolve = useCallback<PageCommentsHandle["resolve"]>(
    async (commentId, resolved) => {
      await resolvePageThreadApi(projectId, pageId, commentId, resolved);
      refresh();
    },
    [projectId, pageId, refresh]
  );

  return {
    comments,
    threads,
    commentedBlocks,
    hiddenResolved,
    loading: isPending,
    add,
    edit,
    remove,
    resolve,
  };
}
