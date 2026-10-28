"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DEFAULT_DATABASE_VIEW,
  databaseViewPositionBetween,
  normalizeDatabaseView,
  sameDatabaseView,
  type DatabaseProperty,
  type DatabaseView,
  type SavedDatabaseView,
} from "./page-databases";
import {
  emptyDatabaseViewFilter,
  legacyDatabaseViewFields,
  legacyDatabaseViewFilter,
  normalizeDatabaseViewFilter,
  resolveDatabaseViewFilter,
} from "./page-database-filters";
import { removeLocalSnapshot, restoreLocalSnapshot } from "./local-snapshots";

export const pageDatabaseViewsKey = (projectId: string, pageId: string) =>
  ["page-database-views", projectId, pageId] as const;

const SAVE_DELAY_MS = 400;

/** The view this browser shows for a database; a per-viewer convenience. */
const activeViewKey = (pageId: string) => `minddy:database-active-view:${pageId}`;
function readActiveView(pageId: string): string | null {
  try {
    return localStorage.getItem(activeViewKey(pageId));
  } catch {
    return null;
  }
}
function writeActiveView(pageId: string, viewId: string) {
  try {
    localStorage.setItem(activeViewKey(pageId), viewId);
  } catch {
    /* The first view is shown instead. */
  }
}

/**
 * Former browser-only view of this database (before MIN-764), removed once
 * read. Its slot expires after 30 days, after which this adoption can go.
 */
async function takeLegacyView(projectId: string, pageId: string): Promise<DatabaseView | null> {
  const key = `minddy:database-list:${projectId}:${pageId}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    const stored = parsed?.format === "minddy-local-v1"
      ? await restoreLocalSnapshot(localStorage, key, "page-list-settings") : null;
    removeLocalSnapshot(localStorage, key);
    return normalizeDatabaseView(stored);
  } catch {
    return null;
  }
}

async function request<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(url, init.body
    ? { ...init, headers: { "Content-Type": "application/json" } } : init);
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || fallback);
  return body as T;
}

/**
 * The saved views of a page database (MIN-764), shared by every member, like
 * the views of the issue board. Members with write access save the active
 * view's changes for everyone and manage the strip; readers can still adjust
 * a view, for themselves and until they leave the page. A database without a
 * saved view shows the default one, saved as its first view on the first
 * change.
 *
 * With the database `schema`, `config.filters` also carries the single filter
 * of a view saved by the previous release, converted, and `update({ filters })`
 * rewrites the single-filter mirror that release still reads. Without it the
 * hook keeps both as stored. `update({ filter, filterValue })` still works: it
 * replaces the conditions with the converted single filter.
 */
export function usePageDatabaseViews(projectId: string, pageId: string, canWrite: boolean,
  schema?: readonly DatabaseProperty[]) {
  const queryClient = useQueryClient();
  const t = useTranslations("PageDatabase");
  const base = `/api/projects/${projectId}/pages/${pageId}/database/views`;
  const { data, isSuccess } = useQuery({
    queryKey: pageDatabaseViewsKey(projectId, pageId),
    queryFn: async () => {
      const body = await request<{ views: SavedDatabaseView[] }>(base, {}, t("saveFailed"));
      return body.views;
    },
  });
  // Every view as this release reads it, whatever cached it: a query cache
  // persisted on the device by the previous release still holds views
  // without `filters`, and the first render reads that cache before any fetch.
  const views = useMemo(() => (data ?? []).map((view) => ({
    ...view,
    view: normalizeDatabaseView(view.view) ?? DEFAULT_DATABASE_VIEW,
  })), [data]);
  const [chosen, setChosen] = useState<{ pageId: string; id: string | null }>(
    () => ({ pageId, id: readActiveView(pageId) }));
  const chosenId = chosen.pageId === pageId ? chosen.id : readActiveView(pageId);
  const active = views.find((view) => view.id === chosenId) ?? views[0] ?? null;
  // Changes not yet confirmed by the server, per page and view.
  const [local, setLocal] = useState<{ key: string; view: DatabaseView } | null>(null);
  const localKey = `${pageId}:${active?.id ?? ""}`;
  const stored = (local?.key === localKey ? local.view : null) ??
    active?.view ?? DEFAULT_DATABASE_VIEW;
  const config = useMemo(() => schema
    ? { ...stored, filters: resolveDatabaseViewFilter(stored, schema) } : stored,
  [stored, schema]);

  const latest = useRef({ config, active, views, localKey, schema });
  latest.current = { config, active, views, localKey, schema };
  // Writes run one after another, so a first change creating the default
  // view is never doubled by the next one.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  // A background save reports its own failure; `rethrow` leaves the report to
  // a caller that shows it, such as the view name dialog.
  const enqueue = useCallback((work: () => Promise<void>, { rethrow = false } = {}) => {
    const next = chain.current.then(work).catch((error) => {
      void queryClient.invalidateQueries({ queryKey: pageDatabaseViewsKey(projectId, pageId) });
      if (rethrow) throw error;
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
    });
    // The chain itself never rejects, so the next write still runs.
    chain.current = next.catch(() => undefined);
    return next;
  }, [queryClient, projectId, pageId, t]);

  const cached = useCallback(() => queryClient.getQueryData<SavedDatabaseView[]>(
    pageDatabaseViewsKey(projectId, pageId)) ?? [], [queryClient, projectId, pageId]);
  const setCached = useCallback((update: (views: SavedDatabaseView[]) => SavedDatabaseView[]) =>
    queryClient.setQueryData<SavedDatabaseView[]>(pageDatabaseViewsKey(projectId, pageId),
      (views) => update(views ?? [])), [queryClient, projectId, pageId]);

  const select = useCallback((id: string) => {
    setChosen({ pageId, id });
    writeActiveView(pageId, id);
  }, [pageId]);

  /** Save a configuration on the view it was made on, or as the first view. */
  const persist = useCallback((viewId: string | null, next: DatabaseView, entryKey: string) =>
    enqueue(async () => {
      let target = viewId ?? cached()[0]?.id ?? null;
      if (target) {
        await request(`${base}/${target}`, { method: "PATCH",
          body: JSON.stringify({ view: next }) }, t("saveFailed"));
        setCached((views) => views.map((view) =>
          view.id === target ? { ...view, view: next } : view));
      } else {
        const body = await request<{ view: SavedDatabaseView }>(base, { method: "POST",
          body: JSON.stringify({ name: t("defaultView"), view: next }) }, t("saveFailed"));
        target = body.view.id;
        setCached((views) => [...views, body.view]);
      }
      // Changes made on the default view before it was saved now belong to
      // the saved one, so the screen does not fall back while they are sent.
      const savedKey = `${pageId}:${target}`;
      setLocal((current) => {
        if (!current || (current.key !== entryKey && current.key !== savedKey)) return current;
        if (sameDatabaseView(current.view, next)) return null;
        return { key: savedKey, view: current.view };
      });
    }), [enqueue, cached, setCached, base, pageId, t]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef<(() => void) | null>(null);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    queued.current?.();
    queued.current = null;
  }, []);

  const update = useCallback((patch: Partial<DatabaseView>) => {
    const { config: previous, active: view, localKey: entryKey, schema: properties } =
      latest.current;
    const next = { ...previous, ...patch };
    if (patch.filters !== undefined) {
      next.filters = normalizeDatabaseViewFilter(patch.filters, properties) ??
        emptyDatabaseViewFilter();
      Object.assign(next, legacyDatabaseViewFields(next.filters, properties ?? []));
    } else if (patch.filter !== undefined || patch.filterValue !== undefined) {
      // A caller of the single filter: its conditions follow it. Without the
      // schema they are left empty, which still reads the single filter.
      next.filters = properties
        ? legacyDatabaseViewFilter(next.filter, next.filterValue, properties)
        : emptyDatabaseViewFilter();
    }
    latest.current = { ...latest.current, config: next };
    setLocal({ key: entryKey, view: next });
    if (!canWrite) return;
    if (timer.current) clearTimeout(timer.current);
    queued.current = () => void persist(view?.id ?? null, next, entryKey);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [canWrite, persist, flush]);

  // A change still waiting when the page closes is saved right away.
  useEffect(() => flush, [projectId, pageId, flush]);

  /** A new view starts from the configuration on screen. */
  const create = useCallback(async (name: string) => {
    flush();
    const { config: current } = latest.current;
    let created: SavedDatabaseView | null = null;
    await enqueue(async () => {
      // The default view on screen becomes the first saved one, so creating
      // a second view does not make it disappear.
      if (!cached().length) {
        const first = await request<{ view: SavedDatabaseView }>(base, { method: "POST",
          body: JSON.stringify({ name: t("defaultView"), view: current }) }, t("saveFailed"));
        setCached((views) => [...views, first.view]);
      }
      const body = await request<{ view: SavedDatabaseView }>(base, { method: "POST",
        body: JSON.stringify({ name, view: current }) }, t("saveFailed"));
      setCached((views) => [...views, body.view]);
      created = body.view;
    }, { rethrow: true });
    if (created) select((created as SavedDatabaseView).id);
  }, [flush, enqueue, cached, setCached, base, t, select]);

  const rename = useCallback(async (viewId: string, name: string) => {
    await request(`${base}/${viewId}`, { method: "PATCH", body: JSON.stringify({ name }) },
      t("saveFailed"));
    setCached((views) => views.map((view) => view.id === viewId ? { ...view, name } : view));
  }, [base, setCached, t]);

  const remove = useCallback(async (viewId: string) => {
    flush();
    await request(`${base}/${viewId}`, { method: "DELETE" }, t("saveFailed"));
    setCached((views) => views.filter((view) => view.id !== viewId));
  }, [flush, base, setCached, t]);

  /** Drop `viewId` where `overId` stands; the order is shared. */
  const move = useCallback((viewId: string, overId: string) => {
    const ordered = latest.current.views;
    const from = ordered.findIndex((view) => view.id === viewId);
    const to = ordered.findIndex((view) => view.id === overId);
    if (from < 0 || to < 0 || from === to) return;
    const rest = ordered.filter((view) => view.id !== viewId);
    const position = databaseViewPositionBetween(
      rest[to - 1]?.position, rest[to]?.position);
    setCached((views) => views.map((view) => view.id === viewId ? { ...view, position } : view)
      .sort((a, b) => a.position - b.position));
    void enqueue(() => request(`${base}/${viewId}`, { method: "PATCH",
      body: JSON.stringify({ position }) }, t("saveFailed")).then(() => undefined));
  }, [setCached, enqueue, base, t]);

  const adopted = useRef<string | null>(null);
  useEffect(() => {
    if (!isSuccess || adopted.current === pageId) return;
    adopted.current = pageId;
    void takeLegacyView(projectId, pageId).then((legacy) => {
      // Views saved on the page win over the one this browser kept.
      if (!legacy || latest.current.views.length ||
          !latest.current.localKey.startsWith(`${pageId}:`)) return;
      // That browser view only knew the single filter.
      update({ sort: legacy.sort, descending: legacy.descending, filter: legacy.filter,
        filterValue: legacy.filterValue, hidden: legacy.hidden });
    });
  }, [isSuccess, projectId, pageId, update]);

  return { views, active, config, update, select, create, rename, remove, move };
}
