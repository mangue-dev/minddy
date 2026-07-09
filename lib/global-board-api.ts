"use client";

import type { GlobalBoardResponse } from "./types";

function browserTimeZone(): string {
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
export async function fetchGlobalBoardApi(): Promise<GlobalBoardResponse> {
  const response = await fetch(`/api/me/board?tz=${encodeURIComponent(browserTimeZone())}`);
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
