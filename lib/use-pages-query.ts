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
  discardPageApi,
  duplicatePageApi,
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
  type Page,
  type PageTreeNode,
} from "./pages";

export const pagesKey = (projectId: string) => ["pages", projectId] as const;

/**
 * Le CORPS d'une page, cache à part (`PageView` la lit, MIN-270).
 *
 * Il est nommé ici et pas chez son lecteur parce que ce n'est pas lui qui le
 * tient à jour : c'est CE module, à chaque écriture acceptée. Un corps
 * enregistré qui ne redescend pas dans ce cache est un corps que le prochain
 * montage de l'éditeur ne verra pas — voir `updatePage`.
 */
export const pageKey = (pageId: string) => ["page", pageId] as const;

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

/**
 * Ce qu'on a TAPÉ mais que le serveur n'a pas encore renvoyé — par page.
 *
 * L'écriture est groupée (une seconde après la dernière frappe) : entre les
 * deux, la sidebar, le fil d'Ariane et le bloc sous-page lisent ce cache, et la
 * seule chose qui puisse leur donner le titre en cours de frappe est un ÉCRIT
 * LOCAL immédiat (`previewPage`). Il faut alors le protéger de la réponse du
 * PATCH précédent, partie avec le titre d'AVANT les dernières lettres : elle
 * arrive après, et sans cette table elle remettrait l'ancien titre dans l'arbre
 * — le titre qu'on est en train de taper se voyait revenir en arrière.
 *
 * L'entrée se retire d'elle-même dès que le serveur RENVOIE ce qu'on a tapé :
 * à ce moment-là il n'y a plus rien à protéger, et la donnée du serveur reprend
 * la main (un renommage par un coéquipier doit pouvoir passer).
 *
 * Au niveau du module, et non dans un état React : `updatePage` doit la lire
 * dans la continuation d'une promesse, longtemps après le rendu qui l'a créée.
 */
type PagePreview = { title?: string; icon?: string | null };
const previews = new Map<string, PagePreview>();

/** La ligne du serveur, recouverte de ce qu'on est en train de taper. */
function withPreview(summary: PageSummary): PageSummary {
  const preview = previews.get(summary.id);
  if (!preview) return summary;
  const echoed =
    (preview.title === undefined || preview.title === summary.title) &&
    (preview.icon === undefined || preview.icon === summary.icon);
  if (echoed) {
    previews.delete(summary.id);
    return summary;
  }
  return { ...summary, ...preview };
}

export interface UsePagesResult {
  pages: PageSummary[];
  tree: PageTreeNode<PageSummary>[];
  byId: Map<string, PageSummary>;
  loading: boolean;
  error: Error | null;
  createPage: (input?: CreatePageInput) => Promise<PageSummary>;
  /**
   * Le titre ou l'icône qu'on TAPE, posés dans le cache sans rien demander à
   * personne : tout ce qui lit la liste (la sidebar au premier chef) suit la
   * frappe, sans attendre l'enregistrement groupé qui viendra une seconde plus
   * tard.
   */
  previewPage: (pageId: string, patch: PagePreview) => void;
  /** Copie une page et sa descendance. Rend la RACINE de la copie. */
  duplicatePage: (pageId: string) => Promise<Page>;
  updatePage: (pageId: string, input: UpdatePageInput) => Promise<Page>;
  trashPage: (pageId: string) => Promise<number>;
  /**
   * DÉTRUIT une page créée puis quittée sans qu'on y écrive (lib/pages-draft.ts).
   * Ni corbeille ni toast : il ne s'est rien passé, c'est bien le propos.
   */
  discardPage: (pageId: string) => Promise<void>;
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

  const previewPage = useCallback(
    (pageId: string, patch: PagePreview) => {
      const pid = projectId as string;
      previews.set(pageId, { ...previews.get(pageId), ...patch });
      const current = readPages(queryClient, pid);
      if (!current) return;
      writePages(
        queryClient,
        pid,
        current.map((page) =>
          page.id === pageId ? { ...page, ...patch } : page
        )
      );
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
          // `withPreview` : la réponse ne remet pas dans l'arbre le titre
          // d'avant les dernières lettres tapées (voir `previews`).
          const next = withPreview(summary);
          writePages(
            queryClient,
            pid,
            current.map((row) => (row.id === pageId ? next : row))
          );
        }
        // Le CORPS redescend dans son propre cache, et c'est indispensable :
        // l'éditeur ne lit son document qu'au MONTAGE (tiptap ne relit jamais
        // `content`), donc tout ce que ce cache porte de périmé sera affiché
        // tel quel au prochain montage — revenir sur la page depuis l'arbre,
        // ou recharger l'onglet, faisait réapparaître le document d'avant les
        // modifications, jusqu'à ce qu'un refetch ait fini par passer. Le
        // rendre à jour ici est le seul endroit qui le sache : c'est celui qui
        // vient d'écrire.
        queryClient.setQueryData(pageKey(pageId), page);
        // La page ENTIÈRE remonte à l'appelant, corps et `version` compris :
        // c'est d'elle que l'autosave (MIN-271) tire la base de sa prochaine
        // écriture. Le cache de la liste, lui, n'en garde que le résumé.
        return page;
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

  const duplicatePage = useCallback(
    async (pageId: string) => {
      const pid = projectId as string;
      const page = await duplicatePageApi(pid, pageId);
      // La copie emporte ses sous-pages : ce n'est donc PAS une ligne de plus
      // dans le cache, c'est une branche entière. On redemande la liste plutôt
      // que de la reconstituer ici — le serveur est le seul à savoir ce qu'il
      // a écrit, et une branche à moitié posée serait un arbre faux.
      await queryClient.invalidateQueries({ queryKey: pagesKey(pid) });
      return page;
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

  const discardPage = useCallback(
    async (pageId: string) => {
      const pid = projectId as string;
      const before = readPages(queryClient, pid);
      // La ligne quitte l'arbre TOUT DE SUITE : le geste qui l'appelle est un
      // départ, et voir une page fantôme dans la sidebar le temps d'un
      // aller-retour serait le seul moment où elle se serait vue.
      if (before) {
        writePages(
          queryClient,
          pid,
          before.filter((page) => page.id !== pageId)
        );
      }
      previews.delete(pageId);
      try {
        await discardPageApi(pid, pageId);
        queryClient.removeQueries({ queryKey: pageKey(pageId) });
      } catch (err) {
        // Elle n'était pas si vide (une écriture partie en parallèle a pu la
        // remplir) : on la remet, sans rien dire. Personne n'a demandé cette
        // suppression, personne n'a à être prévenu qu'elle n'a pas eu lieu.
        if (before) writePages(queryClient, pid, before);
        console.error("[pages] discard failed:", err);
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
    previewPage,
    duplicatePage,
    updatePage,
    trashPage,
    discardPage,
    restorePage,
  };
}
