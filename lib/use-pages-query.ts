"use client";

// Le cache des PAGES d'un projet (MIN-270).
//
// Une seule requête pour tout le projet — la liste à plat, sans le corps des
// documents —, et l'arbre se reconstruit ici (`buildPageTree`). C'est ce qui
// permet à la sidebar, au fil d'Ariane, à la palette et au bloc sous-page de
// lire tous LE MÊME cache : renommer une page ailleurs la renomme partout, sans
// qu'aucune de ces surfaces n'ait sa propre requête.
//
// Les écritures sont OPTIMISTES et rejouées à l'envers en cas de refus. Ce
// n'est pas du confort : un glisser-déposer dans l'arbre qui attend la réponse
// du serveur laisse la ligne sous le curseur revenir à sa place d'avant le
// temps de l'aller-retour, ce qui se lit comme un déplacement raté. Et le refus
// existe pour de bon — reparenter une page sous un de ses descendants répond
// 409 (lib/pages.ts, `wouldCreateCycle`), et il faut alors remettre l'arbre
// exactement là où il était.

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  createPageApi,
  fetchPagesApi,
  restorePageApi,
  trashPageApi,
  updatePageApi,
  type CreatePageInput,
  type PageSummary,
  type UpdatePageInput,
} from "./pages-api";
import {
  buildPageTree,
  descendantIds,
  type PageTreeNode,
} from "./pages";

export const pagesKey = (projectId: string) => ["pages", projectId] as const;

function readPages(
  queryClient: QueryClient,
  projectId: string
): PageSummary[] | undefined {
  return queryClient.getQueryData<PageSummary[]>(pagesKey(projectId));
}

function writePages(
  queryClient: QueryClient,
  projectId: string,
  next: PageSummary[]
): void {
  queryClient.setQueryData(pagesKey(projectId), next);
}

export interface UsePagesResult {
  pages: PageSummary[];
  tree: PageTreeNode<PageSummary>[];
  byId: Map<string, PageSummary>;
  loading: boolean;
  error: Error | null;
  createPage: (input?: CreatePageInput) => Promise<PageSummary>;
  updatePage: (pageId: string, input: UpdatePageInput) => Promise<void>;
  trashPage: (pageId: string) => Promise<number>;
  restorePage: (pageId: string) => Promise<void>;
}

export function usePagesQuery(projectId: string | null): UsePagesResult {
  const queryClient = useQueryClient();
  const enabled = !!projectId;

  const { data, isPending, error } = useQuery({
    queryKey: pagesKey(projectId ?? ""),
    queryFn: () => fetchPagesApi(projectId as string),
    enabled,
  });

  const pages = useMemo(() => data ?? [], [data]);
  const tree = useMemo(() => buildPageTree(pages), [pages]);
  const byId = useMemo(
    () => new Map(pages.map((page) => [page.id, page])),
    [pages]
  );

  const createPage = useCallback(
    async (input: CreatePageInput = {}) => {
      const pid = projectId as string;
      const page = await createPageApi(pid, input);
      const { content: _content, ...summary } = page;
      const current = readPages(queryClient, pid);
      // La ligne rendue par le serveur est posée dans le cache tout de suite :
      // la route qu'on ouvre juste après (une page neuve s'ouvre) doit trouver
      // son titre dans l'arbre sans attendre un refetch.
      if (current) writePages(queryClient, pid, [...current, summary]);
      else void queryClient.invalidateQueries({ queryKey: pagesKey(pid) });
      return summary;
    },
    [projectId, queryClient]
  );

  const updatePage = useCallback(
    async (pageId: string, input: UpdatePageInput) => {
      const pid = projectId as string;
      const before = readPages(queryClient, pid);
      if (before) {
        // Le CORPS n'est pas dans la liste (le serveur ne l'envoie pas) : il
        // sort du patch optimiste, sinon la ligne du cache gagnerait un champ
        // que personne n'y lit et qui pèserait autant que le document.
        const { content: _content, ...visible } = input;
        writePages(
          queryClient,
          pid,
          before.map((page) =>
            page.id === pageId ? { ...page, ...visible } : page
          )
        );
      }
      try {
        const page = await updatePageApi(pid, pageId, input);
        const { content: _content, ...summary } = page;
        const current = readPages(queryClient, pid);
        if (current) {
          writePages(
            queryClient,
            pid,
            current.map((row) => (row.id === pageId ? summary : row))
          );
        }
      } catch (err) {
        // Remettre l'arbre là où il était : c'est le seul rattrapage possible
        // d'un 409 de cycle, et laisser l'état faux à l'écran serait pire que
        // le refus lui-même.
        if (before) writePages(queryClient, pid, before);
        throw err;
      }
    },
    [projectId, queryClient]
  );

  const trashPage = useCallback(
    async (pageId: string) => {
      const pid = projectId as string;
      const before = readPages(queryClient, pid);
      if (before) {
        // Récursif comme le serveur : la page ET ses descendants quittent
        // l'arbre d'un coup, sinon les sous-pages remonteraient à la racine le
        // temps de la réponse.
        const gone = new Set([pageId, ...descendantIds(before, pageId)]);
        writePages(
          queryClient,
          pid,
          before.filter((page) => !gone.has(page.id))
        );
      }
      try {
        const { trashed } = await trashPageApi(pid, pageId);
        void queryClient.invalidateQueries({ queryKey: ["me", "trash"] });
        return trashed;
      } catch (err) {
        if (before) writePages(queryClient, pid, before);
        throw err;
      }
    },
    [projectId, queryClient]
  );

  const restorePage = useCallback(
    async (pageId: string) => {
      const pid = projectId as string;
      await restorePageApi(pid, pageId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pagesKey(pid) }),
        queryClient.invalidateQueries({ queryKey: ["me", "trash"] }),
      ]);
    },
    [projectId, queryClient]
  );

  return {
    pages,
    tree,
    byId,
    loading: enabled && isPending,
    error: (error as Error | null) ?? null,
    createPage,
    updatePage,
    trashPage,
    restorePage,
  };
}
