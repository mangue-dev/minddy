"use client";

import { useEffect, useRef, useState } from "react";
import { isSemanticQuery, normalizeSemanticQuery } from "@/lib/issue-semantic-query";

/**
 * Issue ids ranked by meaning for the query a picker shows (MIN-718).
 *
 * The picker's lexical results answer at once; this hook only adds ids, which
 * the picker intersects with its own eligible candidates and appends AFTER its
 * lexical rows — the highlighted row never moves when they arrive.
 *
 * - Debounced (350 ms), and only for queries `isSemanticQuery` accepts: an
 *   identifier or a short prefix never leaves the browser.
 * - Out of order: each request is aborted when the query changes, and a
 *   response is applied only if it still answers the CURRENT query, so a slow
 *   answer can never replace a newer one.
 * - Cached for the session by scope and normalized query: reopening a picker
 *   or retyping the same words costs nothing and answers instantly. The
 *   cache lives in memory and holds ids only; the server re-checks access on
 *   every miss.
 */

const DEBOUNCE_MS = 350;
const CACHE_MAX = 200;
const cache = new Map<string, string[]>();

/** Test hook: forget cached answers. */
export function clearSemanticIssueCache(): void {
  cache.clear();
}

export function semanticCacheKey(projectId: string | null, query: string): string {
  return `${projectId ?? "*"}\u0000${normalizeSemanticQuery(query)}`;
}

function remember(key: string, ids: string[]) {
  cache.set(key, ids);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export interface SemanticIssueSearch {
  /** Ranked ids for the current query, empty until they arrive. */
  ids: string[];
  /** A request for the current query is in flight. */
  pending: boolean;
}

export function useSemanticIssueSearch(
  query: string,
  options: { projectId?: string | null; enabled?: boolean } = {},
): SemanticIssueSearch {
  const projectId = options.projectId ?? null;
  const enabled = options.enabled !== false && isSemanticQuery(query);
  const normalized = normalizeSemanticQuery(query);
  const key = semanticCacheKey(projectId, normalized);
  const [state, setState] = useState<{ key: string; ids: string[]; pending: boolean }>({
    key: "",
    ids: [],
    pending: false,
  });
  const latest = useRef(key);
  latest.current = key;

  useEffect(() => {
    if (!enabled) return;
    const cached = cache.get(key);
    if (cached) {
      setState({ key, ids: cached, pending: false });
      return;
    }
    setState({ key, ids: [], pending: true });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ q: normalized });
      if (projectId) params.set("project", projectId);
      try {
        const response = await fetch(`/api/issues/semantic-search?${params}`, {
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as
          | { status?: string; hits?: { id: string }[] }
          | null;
        const ids = Array.isArray(body?.hits) ? body.hits.map((hit) => hit.id).filter((id) => typeof id === "string") : [];
        // Cache only real answers: a timeout or an outage may succeed next time.
        if (response.ok && body?.status === "ok") remember(key, ids);
        if (latest.current === key) setState({ key, ids, pending: false });
      } catch {
        if (latest.current === key && !controller.signal.aborted) setState({ key, ids: [], pending: false });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, enabled, projectId, normalized]);

  if (!enabled) return { ids: [], pending: false };
  const cached = cache.get(key);
  if (cached) return { ids: cached, pending: false };
  if (state.key !== key) return { ids: [], pending: true };
  return { ids: state.ids, pending: state.pending };
}
