"use client";

import type { UserStats } from "./types";

async function parseJson<T>(response: Response): Promise<T> {
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
  return data as T;
}

export async function fetchStatsApi(tz: string): Promise<UserStats> {
  return parseJson<UserStats>(await fetch(`/api/stats?tz=${encodeURIComponent(tz)}`));
}
