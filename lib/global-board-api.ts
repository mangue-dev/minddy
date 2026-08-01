"use client";

import { applyPendingBoard } from "./optimistic/issue-writes";
import type { GlobalBoardResponse } from "./types";

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Fetch the whole cross-project board payload (issues + per-project members/
    categories/objectives + blocks relations + cycles) for the "My/All" kanban
    (MIN-29, MIN-32). `tz` lets the server resolve the user's calendar day when
    reconciling cycles. */
export async function fetchGlobalBoardApi(
  signal?: AbortSignal
): Promise<GlobalBoardResponse> {
  const response = await fetch(
    `/api/me/board?tz=${encodeURIComponent(browserTimeZone())}`,
    { signal }
  );
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
  return data as GlobalBoardResponse;
}

/**
 * La `queryFn` de `["me","board"]`, partagée par ses trois observateurs (le
 * board « Tous les tickets », les mentionnables de Numo, le picker de la page
 * Agents). Comme pour les tickets d'un projet : instant de départ retenu,
 * réponse passée par le registre d'écritures en attente, pour qu'une réponse
 * en retard ne rejoue pas l'état d'avant l'édition (MIN-156).
 */
export async function globalBoardQueryFn({
  signal,
}: { signal?: AbortSignal } = {}): Promise<GlobalBoardResponse> {
  const startedAt = Date.now();
  return applyPendingBoard(await fetchGlobalBoardApi(signal), startedAt);
}
