"use client";

// The PAGES cache of a project (MIN-270).
//
// A single query for the entire project — the flat list, without the body of the
// documents —, and the tree is reconstructed here (`buildPageTree`). This is what
// allows the sidebar, breadcrumbs, palette and subpage block to
// read all THE SAME cache: renaming a page elsewhere renames it everywhere, without
// that none of these surfaces have their own query.
//
// Writes are OPTIMISTIC and replayed in reverse in case of refusal. This
// is not comfortable: a drag and drop in the tree which waits for the response
// from the server lets the line under the cursor return to its place before the
// round trip time, which reads like a failed trip. And the refusal
// exists for good — reparenting a page under one of its descendants answers
// 409 (lib/pages.ts, `wouldCreateCycle`), and you must then put the tree back
// exactly where he was.

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  createPageApi,
  discardPageApi,
  duplicatePageApi,
  fetchPageApi,
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
import {
  beginPageWrite,
  beginPagePresence,
  queuePageWrite,
  waitForPageWrites,
} from "./optimistic-page-writes";
import { remapSubpages } from "./pages-subpage";
import type { PageDocJSON } from "./pages-merge";
import { positionAtEnd } from "./pages";
import { buildOptimisticPage } from "./optimistic-page";
import {
  trackPageCreation,
  waitForPageCreation,
} from "./page-creation-settlement";

export const pagesKey = (projectId: string) => ["pages", projectId] as const;

/**
 * The BODY of a page, cached separately (`PageView` reads it, MIN-270).
 *
 * It is named here and not in its reader because it is not he who keeps it up to date: it is THIS module, for each accepted write. A registered
 * body that does not come down to this cache is a body that the next
 * edit of the editor will not see — see `updatePage`.
 */
export const pageKey = (pageId: string) => ["page", pageId] as const;

/** A prefetched body can be mounted directly for a short navigation window. */
export const PAGE_NAVIGATION_FRESH_MS = 10_000;

const preparedPages = new Map<string, number>();

export function isRecentPageData(
  updatedAt: number,
  now = Date.now(),
): boolean {
  return updatedAt > 0 && now - updatedAt <= PAGE_NAVIGATION_FRESH_MS;
}

/** Mark explicit navigation intent so an unrelated recent cache is not trusted. */
export function preparePageNavigation(pageId: string, now = Date.now()): void {
  preparedPages.set(pageId, now + PAGE_NAVIGATION_FRESH_MS);
}

export function isPreparedPageData(
  pageId: string,
  updatedAt: number,
  now = Date.now(),
): boolean {
  const preparedUntil = preparedPages.get(pageId) ?? 0;
  if (preparedUntil < now) {
    preparedPages.delete(pageId);
    return false;
  }
  return isRecentPageData(updatedAt, now);
}

/** Warm the lightweight page tree before the Pages route mounts. */
export function usePrefetchPages() {
  const queryClient = useQueryClient();
  return useCallback(
    (projectId: string) => {
      if (!projectId) return;
      void queryClient.prefetchQuery({
        queryKey: pagesKey(projectId),
        queryFn: () => fetchPagesApi(projectId),
      });
    },
    [queryClient],
  );
}

function readPages(
  queryClient: QueryClient,
  projectId: string
): PageSummary[] | undefined {
  return queryClient.getQueryData<PageSummary[]>(pagesKey(projectId));
}

/**
 * Silence the LIST before writing to it (MIN-346).
 *
 * All writes of this module place the line in the cache by hand.
 * A list query PART BEFORE returns the state before — and
 * react-query wrote it on top when you arrived. The page that we had just created
 * then disappeared from the tree a fraction of a second after having appeared there,
 * without error, without toast: the “+” button seemed to do nothing.
 *
 * The window is not theoretical, and it is the WIDEST on the app from
 * desktop: the page cache is rehydrated from disk
 * (lib/query-provider.tsx), so the tree is painted instantly — ready to click — while its mount revalidation is still in flight.
 *
 * `cancelQueries` cancels this theft and restores the state before the request: this
 * which we write just after holds. Nothing is lost — the truth from the server
 * comes back by the next refetch, or by the real-time bridge.
 */
async function hushPages(
  queryClient: QueryClient,
  projectId: string
): Promise<void> {
  await queryClient.cancelQueries({ queryKey: pagesKey(projectId) });
}

function writePages(
  queryClient: QueryClient,
  projectId: string,
  next: PageSummary[]
): void {
  queryClient.setQueryData(pagesKey(projectId), next);
}

/**
 * What we TYPED but which the server has not yet returned — per page.
 *
 * The writing is grouped (one second after the last keystroke): between the
 * two, the sidebar, the breadcrumbs and the subpage block read this cache, and the
 * only thing that can give them the title being typed is an immediate WRITTEN
 * LOCAL (`previewPage`). It must then be protected from the response of the
 * previous PATCH, part with the title BEFORE the last letters: it
 * arrives after, and without this table it would put the old title back in the tree
 * — the title we are typing was seen going back.
 *
 * The entry withdraws itself as soon as the server RETURNS what we typed:
 * at that moment there is nothing more to protect, and the server data takes over
 * (a renaming by a teammate must be able to pass).
 *
 * At the module level, and not in a React state: `updatePage` should read it
 * as a continuation of a promise, long after the renderer that created it.
 */
type PagePreview = { title?: string; icon?: string | null };
const previews = new Map<string, PagePreview>();

/** The server line, covered with what we are typing. */
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
  createPage: (input?: CreatePageInput) => Promise<PageCreation>;
  prefetchPage: (pageId: string) => void;
  /**
 * The title or icon that we TAPE, placed in the cache without asking anything from
 * anyone: everything that reads the list (the sidebar first and foremost) follows the
 * type, without waiting for the grouped recording which will come a second later
 * * later.
 */
  previewPage: (pageId: string, patch: PagePreview) => void;
  /** Copies a page and its descendants. Returns the ROOT of the copy. */
  duplicatePage: (pageId: string) => Promise<PageCreation>;
  updatePage: (pageId: string, input: UpdatePageInput) => Promise<Page>;
  trashPage: (pageId: string) => Promise<number>;
  /**
 * DESTROYS a page created then left without writing to it (lib/pages-draft.ts).
 * Neither trash nor toast: nothing happened, that's the point.
 */
  discardPage: (pageId: string) => Promise<void>;
  restorePage: (pageId: string) => Promise<void>;
}

/** An optimistic summary plus the authoritative result of its creation POST. */
export type PageCreation = PageSummary & { settled: Promise<Page> };

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
      // Markdown projection only exists on the server. This path is used by the
      // project wizard, not by the blank-page gestures optimized below.
      if (input.markdown !== undefined && input.content === undefined) {
        const page = await createPageApi(pid, input);
        const { content: _content, ...summary } = page;
        await hushPages(queryClient, pid);
        const current = readPages(queryClient, pid);
        if (current) writePages(queryClient, pid, [...current, summary]);
        else void queryClient.invalidateQueries({ queryKey: pagesKey(pid) });
        queryClient.setQueryData(pageKey(page.id), page);
        return { ...summary, settled: Promise.resolve(page) };
      }

      const cached = readPages(queryClient, pid);
      const current = cached ?? [];
      const needsListRefresh = cached === undefined;
      const optimistic = buildOptimisticPage(
        pid,
        { ...input, id: input.id ?? crypto.randomUUID() },
        current,
      );
      const { content: _content, ...summary } = optimistic;

      // Cancellation starts synchronously, before the optimistic row is written,
      // so an older list response cannot erase the new page afterwards.
      void queryClient.cancelQueries({ queryKey: pagesKey(pid) });
      const finishPresence = beginPagePresence(queryClient, pid, [summary], true);
      preparePageNavigation(optimistic.id);
      queryClient.setQueryData(pageKey(optimistic.id), optimistic);

      // The POST owns the page query while it is in flight. PageView observes the
      // optimistic body immediately, then receives the canonical server row on
      // the same key without issuing a second GET.
      const request = trackPageCreation(
        optimistic.id,
        queryClient.fetchQuery({
          queryKey: pageKey(optimistic.id),
          queryFn: async () => {
            if (optimistic.parent_id)
              await waitForPageCreation(optimistic.parent_id);
            return createPageApi(
              pid,
              { ...input, id: optimistic.id },
              // Blank-page payloads are tiny enough for the browser's keepalive
              // budget. Rich JSON bodies may exceed that budget and stay regular.
              { keepalive: input.content === undefined },
            );
          },
          staleTime: 0,
          retry: false,
        }),
      );
      void request
        .then((page) => {
          const { content: _serverContent, ...serverSummary } = page;
          const visibleSummary = withPreview(serverSummary);
          finishPresence(true, [visibleSummary]);
          if (needsListRefresh) {
            void queryClient.invalidateQueries({ queryKey: pagesKey(pid) });
          }
        })
        .catch(() => {
          finishPresence(false);
          queryClient.removeQueries({ queryKey: pageKey(optimistic.id) });
          if (needsListRefresh) {
            void queryClient.invalidateQueries({ queryKey: pagesKey(pid) });
          }
        });
      // This async function deliberately has no await on the optimistic path:
      // callers can navigate next microtask, while dependent work can await the
      // attached settlement and receive creation failures.
      return { ...summary, settled: request };
    },
    [projectId, queryClient]
  );

  const prefetchPage = useCallback(
    (pageId: string) => {
      const pid = projectId as string;
      preparePageNavigation(pageId);
      void queryClient.prefetchQuery({
        queryKey: pageKey(pageId),
        queryFn: () => fetchPageApi(pid, pageId),
        staleTime: PAGE_NAVIGATION_FRESH_MS,
      });
    },
    [projectId, queryClient],
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
      const cached =
        readPages(queryClient, pid)?.find((row) => row.id === pageId) ??
        queryClient.getQueryData<Page>(pageKey(pageId));
      const { content: _content, version: _version, ...visible } = input;
      const write = cached
        ? beginPageWrite(
            queryClient,
            pid,
            cached,
            Object.keys(visible) as (keyof Page)[],
            (row) => ({ ...row, ...visible, ...previews.get(pageId) }),
          )
        : null;
      return queuePageWrite(queryClient, `page:${pid}:${pageId}`, async () => {
        try {
          await waitForPageCreation(pageId);
          const page = await updatePageApi(pid, pageId, input);
          write?.settle(page);
          const { content: _body, ...summary } = page;
          const confirmed = Object.fromEntries(
            Object.keys(visible).map((key) => [
              key,
              summary[key as keyof PageSummary],
            ]),
          );
          queryClient.setQueryData<PageSummary[]>(pagesKey(pid), (rows) =>
            rows?.map((row) =>
              row.id === pageId
                ? withPreview({
                    ...row,
                    ...confirmed,
                    version: summary.version,
                    updated_at: summary.updated_at,
                    updated_by: summary.updated_by,
                    updated_kind: summary.updated_kind,
                    updated_api_key_id: summary.updated_api_key_id,
                  })
                : row,
            ),
          );
          queryClient.setQueryData<Page>(pageKey(pageId), (row) =>
            row
              ? {
                  ...page,
                  database_schema: row.database_schema,
                  database_revision: row.database_revision,
                  database_title_name: row.database_title_name,
                  property_values: row.property_values,
                }
              : page,
          );
          return page;
        } catch (error) {
          write?.settle();
          throw error;
        }
      });
    },
    [projectId, queryClient],
  );

  const duplicatePage = useCallback(
    async (pageId: string) => {
      const pid = projectId as string;
      const current = readPages(queryClient, pid) ?? [];
      const source = current.find((row) => row.id === pageId);
      if (!source) {
        const page = await duplicatePageApi(pid, pageId);
        await queryClient.invalidateQueries({ queryKey: pagesKey(pid) });
        return { ...page, settled: Promise.resolve(page) };
      }
      const family = [source.id, ...descendantIds(current, source.id)];
      const ids = new Map(family.map((id) => [id, crypto.randomUUID()]));
      const now = new Date().toISOString();
      const copies = family.map((id): PageSummary => {
        const row = current.find((item) => item.id === id)!;
        return {
          ...row,
          id: ids.get(id)!,
          parent_id: id === pageId ? row.parent_id : ids.get(row.parent_id!)!,
          position:
            id === pageId
              ? positionAtEnd(
                  current.filter((item) => item.parent_id === row.parent_id),
                )
              : row.position,
          favorite: false,
          version: 1,
          database_revision: 0,
          created_at: now,
          updated_at: now,
        };
      });
      const finishPresence = beginPagePresence(queryClient, pid, copies, true);
      const root = copies[0];
      const request = queuePageWrite(
        queryClient,
        `database:${pid}:${source.parent_id ?? source.id}`,
        async () => {
          await Promise.all(family.map(waitForPageCreation));
          await waitForPageWrites(queryClient, family.map((id) => `page:${pid}:${id}`));
          const page = await duplicatePageApi(
            pid,
            pageId,
            Object.fromEntries(ids),
          );
          const { content: _content, ...summary } = page;
          finishPresence(
            true,
            copies.map((row) => (row.id === page.id ? summary : row)),
          );
          queryClient.setQueryData(pageKey(page.id), page);
          void queryClient.invalidateQueries({ queryKey: pagesKey(pid) });
          return page;
        },
      );
      for (const [index, id] of family.entries()) {
        const copy = copies[index];
        const body = queryClient.getQueryData<Page>(pageKey(id));
        preparePageNavigation(copy.id);
        if (body)
          queryClient.setQueryData(pageKey(copy.id), {
            ...copy,
            content: remapSubpages(body.content as PageDocJSON | null, ids),
          });
        const settlement = trackPageCreation(
          copy.id,
          request.then(async (page) => {
            if (copy.id === page.id) return page;
            return fetchPageApi(pid, copy.id);
          }),
        );
        // PageView joins this query instead of requesting a not-yet-created copy.
        void queryClient
          .fetchQuery({
            queryKey: pageKey(copy.id),
            queryFn: () => settlement,
            staleTime: 0,
            retry: false,
          })
          .catch(() => {});
      }
      void request.catch(() => {
        finishPresence(false);
        for (const copy of copies)
          queryClient.removeQueries({ queryKey: pageKey(copy.id) });
      });
      return { ...root, settled: request };
    },
    [projectId, queryClient],
  );

  const trashPage = useCallback(
    async (pageId: string) => {
      const pid = projectId as string;
      const before = readPages(queryClient, pid) ?? [];
      const gone = new Set([pageId, ...descendantIds(before, pageId)]);
      const removed = before.filter((row) => gone.has(row.id));
      const finishPresence = beginPagePresence(queryClient, pid, removed, false);
      const parentId = before.find((row) => row.id === pageId)?.parent_id;
      return queuePageWrite(
        queryClient,
        `database:${pid}:${parentId ?? pageId}`,
        async () => {
          try {
            await waitForPageCreation(pageId);
            const { trashed } = await trashPageApi(pid, pageId);
            finishPresence(true);
            void queryClient.invalidateQueries({ queryKey: ["me", "trash"] });
            return trashed;
          } catch (error) {
            finishPresence(false);
            throw error;
          }
        },
      );
    },
    [projectId, queryClient],
  );

  const discardPage = useCallback(
    async (pageId: string) => {
      const pid = projectId as string;
      try {
        await waitForPageCreation(pageId);
      } catch {
        // A creation that failed left no server row to discard.
        return;
      }
      await hushPages(queryClient, pid);
      const before = readPages(queryClient, pid);
      // The line leaves the tree IMMEDIATELY: the gesture that calls it is a
      // start, and see a ghost page in the sidebar for a while
      // back and forth would be the only time she saw each other.
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
        // It was not so empty (a parallel writing could have
        // fill in): we put it back, without saying anything. Nobody asked for this
        // deletion, no one has to be informed that it did not take place.
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
    prefetchPage,
    previewPage,
    duplicatePage,
    updatePage,
    trashPage,
    discardPage,
    restorePage,
  };
}
