"use client";

import { useQuery } from "@tanstack/react-query";
import { HOME_BRIEF_KEY } from "./query-keys";
import { primeResolvedMentions, type ResolvedMentionAnswer } from "./mention-resolution";
import { fetchSeeded } from "./server-seed";

/** Where Home reads Numo's word; the `/home` document carries its answer. */
export const HOME_BRIEF_PATH = "/api/home/brief";

export interface HomeBriefSuggestion {
  label: string;
  prompt: string;
}

export interface HomeBrief {
  id: string;
  /** Markdown with typed mentions. */
  content: string;
  suggestions: HomeBriefSuggestion[];
  generated_at: string;
}

/**
 * Numo's word on the home page (MIN-930), as GET /api/home/brief returns it.
 * Numo writes it in the background; this read never calls a model.
 *
 * The `/home` document carries this read (lib/server/server-seed.ts), and the
 * answer resolves the word's mentions for this reader, which prime the pills'
 * cache (MIN-1006): a cold load of Home waits for neither request.
 *
 * Freshness: a new version is announced on the user's realtime topic
 * (`numo_home_briefs`, without its content) and invalidates this key
 * (lib/realtime-keys.ts). No staleTime, therefore.
 */
export function useHomeBriefQuery(enabled = true) {
  const { data, isPending } = useQuery({
    queryKey: HOME_BRIEF_KEY,
    enabled,
    // A failed read keeps the word on screen (React Query keeps the last
    // data) and is retried once, so the suggestion rows never wait long.
    retry: 1,
    queryFn: async (): Promise<HomeBrief | null> => {
      const response = await fetchSeeded(HOME_BRIEF_PATH);
      if (!response.ok) throw new Error(`Home brief: ${response.status}`);
      const body = (await response.json()) as { brief?: (HomeBrief & { mentions?: ResolvedMentionAnswer[] }) | null };
      if (!body.brief) return null;
      const { mentions, ...brief } = body.brief;
      if (Array.isArray(mentions)) primeResolvedMentions(mentions);
      return brief;
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
