"use client";

// Cross-project search index for the command palette (MIN-91).
//
// The palette lists every ticket and every objective of every project, from any
// page — so the data can't come from the current project's caches. It comes
// from GET /api/me/search-index, in a shape trimmed to what a row needs.
//
// Two things keep that affordable:
// - it is fetched ONCE per tab, off the critical path: the query stays disabled
//   until the browser goes idle after mount (or until the palette is opened,
//   whichever comes first), so a page load never waits on it;
// - it is revalidated on palette open only when stale (`refetchQueries({ stale:
//   true })`), so hammering ⌘K doesn't hammer the server.
//
// Fraîcheur : l'index est un INSTANTANÉ, et le rafraîchir coûte 4 000 lignes.
// Trois choses le tiennent à jour sans le recharger :
// - le projet COURANT ne le lit même pas : app-shell-chrome remplace ses lignes
//   par ["issues", projectId] / ["objectives", projectId], toujours vivants ;
// - les actions ⌘; patchent la ligne qu'elles touchent (patchSearchIndexIssue) ;
// - ce qui est écrit AILLEURS (Numo, le MCP, un coéquipier) est posé ligne à
//   ligne par le pont temps réel — writeIndexRow plus bas. Sans lui, un ticket
//   créé pendant la session n'était trouvable dans ⌘K qu'au rechargement complet
//   de l'index, et seulement hors du projet courant.
// Le rechargement complet reste le filet : marqué périmé par le pont, rejoué à
// l'ouverture de la palette.

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  SearchIndexIssue,
  SearchIndexObjective,
  SearchIndexResponse,
} from "./types";

export const SEARCH_INDEX_KEY = ["me", "search-index"] as const;

/** Idle delay before arming the fetch when requestIdleCallback is missing. */
const ARM_FALLBACK_MS = 2_000;
/** How long an index snapshot is trusted before a palette open revalidates it. */
const SEARCH_INDEX_STALE_MS = 30_000;

async function fetchSearchIndexApi(): Promise<SearchIndexResponse> {
  const response = await fetch("/api/me/search-index");
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  if (data == null) throw new Error("Empty response");
  return data as SearchIndexResponse;
}

/**
 * The palette's cross-project index. `armNow()` short-circuits the idle wait
 * (call it when the palette opens); `refreshIfStale()` revalidates a snapshot
 * that has aged past SEARCH_INDEX_STALE_MS, and no-ops otherwise.
 */
export function useSearchIndex() {
  const queryClient = useQueryClient();
  const [armed, setArmed] = useState(false);

  // Arm on idle: the palette is never the reason a page is slow to paint.
  useEffect(() => {
    if (armed) return;
    const idle = (
      window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      }
    ).requestIdleCallback;
    if (idle) {
      const handle = idle(() => setArmed(true), { timeout: ARM_FALLBACK_MS });
      return () => {
        (
          window as Window & { cancelIdleCallback?: (h: number) => void }
        ).cancelIdleCallback?.(handle);
      };
    }
    const timer = setTimeout(() => setArmed(true), ARM_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  const { data } = useQuery({
    queryKey: SEARCH_INDEX_KEY,
    queryFn: fetchSearchIndexApi,
    enabled: armed,
    staleTime: SEARCH_INDEX_STALE_MS,
  });

  const armNow = useCallback(() => setArmed(true), []);

  const refreshIfStale = useCallback(() => {
    void queryClient.refetchQueries({ queryKey: SEARCH_INDEX_KEY, stale: true });
  }, [queryClient]);

  return { index: data ?? null, armNow, refreshIfStale };
}

/**
 * Patch one indexed ticket in place — used by the palette's ⌘; actions so the
 * row's status icon updates immediately, exactly like the per-project cache
 * patch does for the board. No-op when the index isn't loaded.
 */
export function patchSearchIndexIssue(
  queryClient: QueryClient,
  issueId: string,
  patch: Partial<SearchIndexIssue>
): void {
  queryClient.setQueryData<SearchIndexResponse>(SEARCH_INDEX_KEY, (old) =>
    old
      ? {
          ...old,
          issues: old.issues.map((i) => (i.id === issueId ? { ...i, ...patch } : i)),
        }
      : old
  );
}

/**
 * Ajouter ou retirer une ligne de l'index, pour ce qui est écrit AILLEURS
 * (lib/optimistic/remote-echo.ts).
 *
 * Le patch ci-dessus ne suffisait pas : il ne touche que des lignes DÉJÀ
 * indexées. Un ticket que Numo vient de créer n'y est par définition pas — la
 * palette ne le trouvait donc qu'après un rechargement complet de l'index (4 000
 * lignes, déclenché à son ouverture quand l'instantané est périmé). Sauf dans le
 * projet courant, dont app-shell-chrome remplace les lignes par ses caches
 * vivants ; ailleurs, ⌘K ignorait le ticket.
 *
 * Une ligne inconnue est mise EN TÊTE : la route trie `updated_at desc`, et ce
 * qui vient d'être écrit est ce qu'il y a de plus récent.
 */
function writeIndexRow<T extends { id: string }>(
  queryClient: QueryClient,
  slice: "issues" | "objectives",
  id: string,
  row: T | null
): void {
  queryClient.setQueryData<SearchIndexResponse>(SEARCH_INDEX_KEY, (old) => {
    if (!old) return old;
    const rows = old[slice] as unknown as T[];
    let next: T[];
    if (!row) {
      next = rows.filter((r) => r.id !== id);
      if (next.length === rows.length) return old;
    } else if (rows.some((r) => r.id === id)) {
      next = rows.map((r) => (r.id === id ? { ...r, ...row } : r));
    } else {
      next = [row, ...rows];
    }
    return { ...old, [slice]: next };
  });
}

export function upsertSearchIndexIssue(
  queryClient: QueryClient,
  issue: SearchIndexIssue
): void {
  writeIndexRow(queryClient, "issues", issue.id, issue);
}

export function removeSearchIndexIssue(
  queryClient: QueryClient,
  issueId: string
): void {
  writeIndexRow<SearchIndexIssue>(queryClient, "issues", issueId, null);
}

export function upsertSearchIndexObjective(
  queryClient: QueryClient,
  objective: SearchIndexObjective
): void {
  writeIndexRow(queryClient, "objectives", objective.id, objective);
}

export function removeSearchIndexObjective(
  queryClient: QueryClient,
  objectiveId: string
): void {
  writeIndexRow<SearchIndexObjective>(queryClient, "objectives", objectiveId, null);
}
