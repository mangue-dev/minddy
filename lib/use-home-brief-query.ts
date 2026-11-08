"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Numo's word on the home page (MIN-930), as GET /api/home/brief returns it.
 * Numo writes it in the background; this read never calls a model.
 *
 * Freshness: a new version is announced on the user's realtime topic
 * (`numo_home_briefs`, without its content) and invalidates this key
 * (lib/realtime-keys.ts). No staleTime, therefore.
 */
export const HOME_BRIEF_KEY = ["me", "home-brief"] as const;

export interface HomeBriefSuggestion {
  label: string;
  prompt: string;
}

export interface HomeBrief {
  id: string;
  /** Markdown with typed mentions. */
  content: string;
  suggestions: HomeBriefSuggestion[];
  /** The background conversation that wrote the newest covered entry. */
  conversation_id: string | null;
  generated_at: string;
}

export function useHomeBriefQuery(enabled = true) {
  const { data, isPending } = useQuery({
    queryKey: HOME_BRIEF_KEY,
    enabled,
    // A failed read keeps the word on screen (React Query keeps the last
    // data) and is retried once, so the suggestion rows never wait long.
    retry: 1,
    queryFn: async (): Promise<HomeBrief | null> => {
      const response = await fetch("/api/home/brief");
      if (!response.ok) throw new Error(`Home brief: ${response.status}`);
      const body = (await response.json()) as { brief?: HomeBrief | null };
      return body.brief ?? null;
    },
  });
  return { brief: data ?? null, loading: enabled && isPending };
}

/** The home page showed this version: the entries it covers are now seen. */
export async function markHomeBriefSeen(id: string): Promise<void> {
  await fetch("/api/home/brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seen: id }),
  }).catch(() => {});
}
