"use client";

// Le fil d'une page, côté client (MIN-282).
//
// Une seule requête — le fil ENTIER — et tout le reste est du calcul : l'ordre
// et le détachement vivent dans lib/page-comments.ts, qui ne sait rien du
// réseau. Ce module ne fait que brancher les deux, et les écritures qui les font
// bouger.
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
  updatePageCommentApi,
} from "@/lib/pages-api";
import {
  arrangeThreads,
  type PageComment,
  type PageThread,
} from "@/lib/page-comments";

export const pageCommentsKey = (pageId: string) =>
  ["page-comments", pageId] as const;

export interface PageCommentsHandle {
  comments: PageComment[];
  /** Les fils VISIBLES, ordonnés — détachés en tête. */
  threads: PageThread[];
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
}

export function usePageComments({
  projectId,
  pageId,
  /** Les ids de blocs du document TEL QU'IL EST À L'ÉCRAN — c'est lui, et pas
      la dernière sauvegarde, qui décide de ce qui est détaché. */
  blockIds,
}: {
  projectId: string;
  pageId: string;
  blockIds: ReadonlySet<string>;
}): PageCommentsHandle {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: pageCommentsKey(pageId),
    queryFn: () => fetchPageCommentsApi(projectId, pageId),
  });
  const comments = useMemo(() => data ?? [], [data]);

  const threads = useMemo(
    () => arrangeThreads(comments, blockIds),
    [comments, blockIds]
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
  return {
    comments,
    threads,
    loading: isPending,
    add,
    edit,
    remove,
  };
}
