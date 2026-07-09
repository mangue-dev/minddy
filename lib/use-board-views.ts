"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import {
  DEFAULT_CONFIG,
  configsEqual,
  lockToMe,
  normalizeConfig,
  viewConfigOf,
} from "./view-filter";
import { useViewsQuery, type ViewScope } from "./use-views-query";
import type { View, ViewConfig } from "./types";

/**
 * The whole saved-view machinery of a kanban board — shared by the project
 * board and the global (cross-project) board:
 *   - the ordered pill list (default view first, the kind='my' system view
 *     second, then customs);
 *   - selection, persisted per scope in localStorage, with a one-shot ?view=
 *     override (`"my"` targets the system view, else a view id);
 *   - the working config + dirty flag, with the system view's assignee filter
 *     pinned through lockToMe so a save can never unlock it;
 *   - create/save/rename/delete handlers (delete keeps at least one custom
 *     view; the system view is not deletable);
 *   - live adoption of external edits to the active view (Numo, a teammate)
 *     as long as the user has no unsaved local edits.
 */

const storageKeyOf = (scope: ViewScope) =>
  scope.kind === "project" ? `minddy:view:${scope.projectId}` : "minddy:view:global";

function readStoredView(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredView(key: string, id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(key, id);
    else window.localStorage.removeItem(key);
  } catch {
    /* localStorage unavailable (private mode / disabled) — ignore. */
  }
}

/** A view's config, with the system view's invariant enforced. */
function configOf(view: View): ViewConfig {
  const config = viewConfigOf(view);
  return view.kind === "my" ? lockToMe(config) : config;
}

export function useBoardViews(
  scope: ViewScope,
  {
    viewParam,
    onViewParamConsumed,
  }: {
    /** The ?view= search param, if present: "my" or a view id. */
    viewParam: string | null;
    /** Strip the ?view= param from the URL (it is a one-shot instruction). */
    onViewParamConsumed: () => void;
  }
) {
  const t = useTranslations("Board");
  const {
    views,
    loading: viewsLoading,
    createView,
    updateView,
    deleteView,
  } = useViewsQuery(scope);

  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [rawConfig, setRawConfig] = useState<ViewConfig>(DEFAULT_CONFIG);
  const storageKey = storageKeyOf(scope);
  const restoredKeyRef = useRef<string | null>(null);
  // Signature of the config we last applied from the active view — lets us tell
  // an external change to that view (Numo, a teammate) apart from the user's own
  // local edits, so we adopt the former live without clobbering the latter.
  const appliedSigRef = useRef<string | null>(null);

  // Reset the working view state the instant the scope changes — during
  // render, so no frame shows the previous board's view before the restore
  // effect runs.
  const [prevKey, setPrevKey] = useState(storageKey);
  if (prevKey !== storageKey) {
    setPrevKey(storageKey);
    setActiveViewId(null);
    setRawConfig(DEFAULT_CONFIG);
  }

  // Pill order: default view first (the restore fallback must never land on an
  // empty assigned-to-me board), system view second, other customs after —
  // whatever positions the rows carry.
  const orderedViews = useMemo(() => {
    const system = views.find((v) => v.kind === "my") ?? null;
    const customs = views.filter((v) => v.kind !== "my");
    if (!system) return customs;
    if (customs.length === 0) return [system];
    return [customs[0], system, ...customs.slice(1)];
  }, [views]);
  const customCount = orderedViews.length - (orderedViews.some((v) => v.kind === "my") ? 1 : 0);

  const activeView = orderedViews.find((v) => v.id === activeViewId) ?? null;
  const locked = activeView?.kind === "my";
  const config = locked ? lockToMe(rawConfig) : rawConfig;
  const setConfig = (next: ViewConfig) => setRawConfig(locked ? lockToMe(next) : next);
  const baseline = activeView ? configOf(activeView) : DEFAULT_CONFIG;
  const dirty = !configsEqual(config, baseline);

  const selectView = (id: string | null) => {
    setActiveViewId(id);
    const v = id ? orderedViews.find((x) => x.id === id) : null;
    setRawConfig(v ? configOf(v) : DEFAULT_CONFIG);
    writeStoredView(storageKey, id);
  };

  /** Create a view carrying the current working config, and select it. */
  const createViewAndSelect = async (name: string): Promise<View> => {
    const view = await createView({ name, ...config });
    setActiveViewId(view.id);
    writeStoredView(storageKey, view.id);
    return view;
  };

  /** Persist the working config into the active view (the Save button). */
  const saveActiveView = async () => {
    if (!activeView) return;
    try {
      await updateView(activeView.id, {
        filters: config.filters,
        sort: config.sort,
        display: config.display,
      });
      toast.success(t("viewUpdated"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const renameView = async (view: View, name: string) => {
    await updateView(view.id, { name });
  };

  const handleDeleteView = async (view: View) => {
    if (view.kind === "my") return; // the UI never offers it; belt only
    if (customCount <= 1) {
      toast.error(t("needOneView"));
      return;
    }
    try {
      await deleteView(view.id);
      if (view.id === activeViewId) {
        // Fall back to another view — never leave the board without a selection.
        const next = orderedViews.find((v) => v.id !== view.id);
        if (next) selectView(next.id);
      }
      toast.success(t("viewDeleted"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Select a view once the list has loaded: the one-shot ?view= instruction
  // wins (then gets stripped), else the remembered selection, else the first
  // pill — so a saved view's filters and sort survive a page reload.
  useEffect(() => {
    if (viewsLoading || orderedViews.length === 0) return;
    if (viewParam) {
      const target =
        viewParam === "my"
          ? orderedViews.find((v) => v.kind === "my")
          : orderedViews.find((v) => v.id === viewParam);
      onViewParamConsumed();
      if (target) {
        restoredKeyRef.current = storageKey;
        setActiveViewId(target.id);
        setRawConfig(configOf(target));
        writeStoredView(storageKey, target.id);
        return;
      }
      // Unknown target: consumed above, fall through to the normal restore.
    }
    if (restoredKeyRef.current === storageKey) return;
    restoredKeyRef.current = storageKey;
    const savedId = readStoredView(storageKey);
    const view =
      (savedId ? orderedViews.find((v) => v.id === savedId) : undefined) ??
      orderedViews[0];
    setActiveViewId(view.id);
    setRawConfig(configOf(view));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onViewParamConsumed is an event callback, not a dependency
  }, [storageKey, viewsLoading, orderedViews, viewParam]);

  // Keep the working config in sync when the ACTIVE view's stored config changes
  // underneath us — Numo editing it (incl. the "Ask Numo" / generate-a-view
  // flows) or a teammate editing a shared view. Only adopt when the user has no
  // unsaved local edits (working config still matches what we last applied), so
  // we never overwrite their in-progress tweaks.
  useEffect(() => {
    if (!activeView) {
      appliedSigRef.current = null;
      return;
    }
    const storedSig = normalizeConfig(configOf(activeView));
    const prev = appliedSigRef.current;
    if (prev === storedSig) return;
    appliedSigRef.current = storedSig;
    if (prev === null) return; // first observation — select/restore set config
    if (normalizeConfig(config) === prev) setRawConfig(configOf(activeView));
  }, [activeView, config]);

  return {
    views: orderedViews,
    viewsLoading,
    activeView,
    activeViewId,
    config,
    setConfig,
    dirty,
    selectView,
    createViewAndSelect,
    saveActiveView,
    renameView,
    deleteView: handleDeleteView,
  };
}
