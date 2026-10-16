"use client";

import { createUuid } from "@/lib/create-uuid";

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

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { acceptPageRead, acceptPageWrite, beginPageRead, capturePageReadFailure, finishPageRead, hasNewerAcceptedPageMetadata, isAcceptedPageVersion, pageReadState } from "./page-read-receipts";

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
  acceptPageReadSummary,
  beginPageWrite,
  beginPagePresence,
  queuePageWrite,
  recordAcceptedPageWrite,
  waitForPageWrites,
} from "./optimistic-page-writes";
import { remapSubpages } from "./pages-subpage";
import type { PageDocJSON } from "./pages-merge";
import { positionAtEnd } from "./pages";
import { buildOptimisticPage } from "./optimistic-page";
import {
  isPageCreationPending,
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

/** A late authorized GET must not replace a newer accepted write in this cache. */
export async function fetchPageNavigationData(client: QueryClient, projectId: string, pageId: string, signal?: AbortSignal): Promise<Page> {
  const query = client.getQueryCache().find({ queryKey: pageKey(pageId), exact: true });
  const sequence = beginPageRead(query, signal);
  try {
    const incoming = await fetchPageApi(projectId, pageId, signal);
    signal?.throwIfAborted();
    if (incoming.id !== pageId || incoming.project_id !== projectId) throw new Error("Page response does not match its requested scope");
    const current = client.getQueryData<Page>(pageKey(pageId));
    const page = current?.id === pageId && current.project_id === projectId && current.version > incoming.version &&
      isAcceptedPageVersion(query, { projectId, pageId, version: current.version })
      ? current : incoming;
    if (client.getQueryCache().find({ queryKey: pageKey(pageId), exact: true }) === query) {
      const olderMetadata = hasNewerAcceptedPageMetadata(query,
        { projectId, pageId, version: incoming.version, updatedAt: incoming.updated_at });
      acceptPageRead(query, sequence, { projectId, pageId, version: page.version,
        updatedAt: page.version === incoming.version ? incoming.updated_at : undefined }, signal);
      const read = pageReadState(query);
      if (read?.sequence === sequence && read.accepted?.sequence === sequence &&
          !read.failure && !read.accepted.signal?.aborted && !olderMetadata) {
        acceptPageReadSummary(client, projectId, incoming);
      }
    }
    return page;
  } catch (error) {
    if (client.getQueryCache().find({ queryKey: pageKey(pageId), exact: true }) === query) {
      capturePageReadFailure(query, error, sequence, signal);
    }
    throw error;
  } finally {
    finishPageRead(query, sequence);
  }
}

/** Certify the actual creation result, retaining its ordinary queued-POST owner. */
export async function fetchPageCreationData(client: QueryClient, projectId: string, pageId: string,
  create: () => Promise<Page>): Promise<Page> {
  const query = client.getQueryCache().find({ queryKey: pageKey(pageId), exact: true });
  const sequence = beginPageRead(query, undefined, "creation");
  try {
    const page = await create();
    if (page.id !== pageId || page.project_id !== projectId || page.version <= 0) {
      throw new Error("Page creation response does not match its requested scope");
    }
    if (client.getQueryCache().find({ queryKey: pageKey(pageId), exact: true }) === query) {
      acceptPageRead(query, sequence, { projectId, pageId, version: page.version, updatedAt: page.updated_at }, undefined, "creation");
    }
    return page;
  } catch (error) {
    if (client.getQueryCache().find({ queryKey: pageKey(pageId), exact: true }) === query) {
      capturePageReadFailure(query, error, sequence);
    }
    throw error;
  } finally {
    finishPageRead(query, sequence);
  }
}

/** A canceled refetch can resolve with cached data without an accepted GET. */
export class PageWriteBasisError extends Error {}

/** A surface can join another owner's actual read, but cannot reuse its old receipt. */
export function createPageSurfaceRead(client: QueryClient, projectId: string, pageId: string) {
  const floor = () => {
    const query = client.getQueryCache().find({ queryKey: pageKey(pageId), exact: true });
    const read = pageReadState(query);
    const joining = !!read?.pending && read.pending.sequence === read.sequence && !read.pending.signal?.aborted &&
      query?.state.fetchStatus === "fetching";
    return { query, sequence: read ? Math.max(0, read.sequence - Number(joining)) : 0 };
  };
  const mounted = floor();
  const hasReceipt = (page: Page | undefined, since: ReturnType<typeof floor>) => {
    const query = client.getQueryCache().find({ queryKey: pageKey(pageId), exact: true });
    const read = pageReadState(query);
    const accepted = read?.accepted;
    return !!accepted && !!page && page.id === pageId && page.project_id === projectId && page.version > 0 &&
      accepted.projectId === projectId && accepted.pageId === pageId && accepted.version === page.version &&
      accepted.sequence === read?.sequence && !read.failure && !accepted.signal?.aborted &&
      accepted.sequence > (query === since.query ? since.sequence : 0);
  };
  const queryFn = ({ signal }: { signal: AbortSignal }) => fetchPageNavigationData(client, projectId, pageId, signal);
  const canUsePrepared = (page: Page | undefined, updatedAt: number) => {
    if (!page || page.id !== pageId || page.project_id !== projectId || page.version <= 0 ||
        !isPreparedPageData(pageId, updatedAt)) return false;
    const query = client.getQueryCache().find({ queryKey: pageKey(pageId), exact: true });
    // Pending creation owns the POST, and every write waits for its settlement.
    // A recent cache timestamp or canceled GET alone supplies no write authority.
    const read = pageReadState(query);
    const creating = isPageCreationPending(pageId) && read?.pending?.source === "creation" &&
      read.pending.sequence === read.sequence && query?.state.fetchStatus === "fetching";
    return !read?.failure && (creating ||
      hasReceipt(page, { query, sequence: 0 }));
  };
  return {
    queryFn,
    canUsePrepared,
    hasAccepted: (page: Page | undefined) => hasReceipt(page, mounted),
    observeFailure: (error: unknown) => {
      // Existing read-only consumers can share this query with a raw GET.
      // Their observed failures must also invalidate a previously accepted basis.
      const query = client.getQueryCache().find({ queryKey: pageKey(pageId), exact: true });
      capturePageReadFailure(query, error);
    },
    failure: () => {
      const query = client.getQueryCache().find({ queryKey: pageKey(pageId), exact: true });
      return pageReadState(query)?.failure;
    },
    async acquire() {
      const required = floor();
      const page = await client.fetchQuery({ queryKey: pageKey(pageId), queryFn, staleTime: 0, retry: false });
      if (!hasReceipt(page, required)) {
        throw new PageWriteBasisError("No fresh, non-aborted Page read was accepted");
      }
      return page;
    },
  };
}

/** The tree and tab strip share the same freshness-bounded document preparation. */
export function prefetchPageNavigation(queryClient: QueryClient, projectId: string, pageId: string): void {
  preparePageNavigation(pageId);
  void queryClient.prefetchQuery({
    queryKey: pageKey(pageId),
    queryFn: ({ signal }) => fetchPageNavigationData(queryClient, projectId, pageId, signal),
    staleTime: PAGE_NAVIGATION_FRESH_MS,
  });
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

/**
 * A prepared document remains a valid editing basis for this mounted surface.
 * The navigation TTL only decides whether a new surface may trust the cache;
 * expiring it must not unmount an editor during an unrelated menu interaction.
 * Each keyed document surface makes its own initial readiness decision.
 */
export function usePageSurfaceReady(
  pageId: string,
  dataUpdatedAt: number,
  isFetchedAfterMount: boolean,
  invalidated = false,
  preparedAuthorized = false,
): boolean {
  const [preparedOnMount] = useState(() =>
    !invalidated && preparedAuthorized,
  );
  return preparedOnMount || isFetchedAfterMount;
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
  updatePage: (pageId: string, input: UpdatePageInput, canDispatch?: () => boolean) => Promise<Page>;
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

/**
 * Create a page in an explicit project. The pages hook binds creation to the
 * project it reads; sidebar rows act on whichever project was right-clicked,
 * so they call this through `useCreatePage` instead.
 */
export async function createProjectPage(
  queryClient: QueryClient,
  pid: string,
  input: CreatePageInput = {},
): Promise<PageCreation> {
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
    { ...input, id: input.id ?? createUuid() },
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
      queryFn: () => fetchPageCreationData(queryClient, pid, optimistic.id, async () => {
        if (optimistic.parent_id)
          await waitForPageCreation(optimistic.parent_id);
        return createPageApi(
          pid,
          { ...input, id: optimistic.id },
          // Blank-page payloads are tiny enough for the browser's keepalive
          // budget. Rich JSON bodies may exceed that budget and stay regular.
          { keepalive: input.content === undefined },
        );
      }),
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
}

/** Page creation keyed by the target project rather than by a pages query. */
export function useCreatePage(): (projectId: string, input?: CreatePageInput) => Promise<PageCreation> {
  const queryClient = useQueryClient();
  return useCallback(
    (projectId: string, input: CreatePageInput = {}) =>
      createProjectPage(queryClient, projectId, input),
    [queryClient]
  );
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
    (input: CreatePageInput = {}) =>
      createProjectPage(queryClient, projectId as string, input),
    [projectId, queryClient]
  );

  const prefetchPage = useCallback(
    (pageId: string) => {
      prefetchPageNavigation(queryClient, projectId as string, pageId);
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
    async (pageId: string, input: UpdatePageInput, canDispatch?: () => boolean) => {
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
            { preserveNewerPageRead: true },
          )
        : null;
      return queuePageWrite(queryClient, `page:${pid}:${pageId}`, async () => {
        try {
          // Queue and creation waits can outlive the editing surface or account.
          // This callback is local authority and never enters the PATCH body.
          if (canDispatch && !canDispatch()) throw new PageWriteBasisError("Page write owner retired before dispatch");
          await waitForPageCreation(pageId);
          if (canDispatch && !canDispatch()) throw new PageWriteBasisError("Page write owner retired before dispatch");
          const page = await updatePageApi(pid, pageId, input);
          // The current body can be newer than this delayed accepted ACK. The
          // writer keeps canonical GET fields apart from queued local overlays.
          const current = queryClient.getQueryData<Page>(pageKey(pageId));
          const retained = current?.id === pageId && current.project_id === pid && current.version > page.version &&
            isAcceptedPageVersion(queryClient.getQueryCache().find({ queryKey: pageKey(pageId), exact: true }),
              { projectId: pid, pageId, version: current.version }) ? current : page;
          const settled = write?.settle(page);
          const accepted = settled?.version === retained.version ? { ...retained, ...settled } : retained;
          const { content: _body, ...summary } = accepted;
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
                  ...accepted,
                  database_schema: row.database_schema,
                  database_revision: row.database_revision,
                  database_title_name: row.database_title_name,
                  property_values: row.property_values,
                }
              : accepted,
          );
          acceptPageWrite(queryClient.getQueryCache().find({ queryKey: pageKey(pageId), exact: true }),
            { projectId: page.project_id, pageId: page.id, version: page.version, updatedAt: page.updated_at });
          // Both caches now hold this acknowledgement: its realtime echo has nothing to add.
          recordAcceptedPageWrite(queryClient, page, Object.keys(input));
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
      const ids = new Map(family.map((id) => [id, createUuid()]));
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
            queryFn: () => fetchPageCreationData(queryClient, pid, copy.id, () => settlement),
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
