"use client";

import { useQuery } from "@tanstack/react-query";
import type { MentionPreview, PreviewMentionType } from "@/lib/mention-preview";

/** A card read again after a minute, like a mention's label. */
const FRESH_MS = 60_000;

/** Bumped when a card's shape changes, so no cache answers in the old one.
    Cards are never persisted (lib/query-provider.tsx); this covers the ones a
    snapshot saved before that rule. */
const SHAPE = 3;

export const mentionPreviewKey = (type: PreviewMentionType, id: string, project: string | null) =>
  ["mention-preview", SHAPE, type, id, project ?? ""] as const;

async function fetchMentionPreview(
  type: PreviewMentionType,
  id: string,
  project: string | null,
): Promise<MentionPreview | null> {
  const params = new URLSearchParams({ type, id });
  if (project) params.set("project", project);
  const response = await fetch(`/api/mentions/preview?${params}`);
  if (!response.ok) throw new Error("Mention preview unavailable");
  const { preview } = (await response.json()) as { preview: MentionPreview | null };
  return preview;
}

/**
 * The hover card of a mention (MIN-879), read only once the card opens:
 * a page full of mentions costs nothing until one is hovered. `project` is a
 * skill's project, or the project the mention is read in.
 */
export function useMentionPreview(
  type: PreviewMentionType,
  id: string,
  project: string | null,
  enabled: boolean,
) {
  return useQuery({ ...mentionPreviewQuery(type, id, project), enabled });
}

/** The card's query, shared by the card and its read-ahead on hover intent. */
export function mentionPreviewQuery(type: PreviewMentionType, id: string, project: string | null) {
  return {
    queryKey: mentionPreviewKey(type, id, project),
    queryFn: () => fetchMentionPreview(type, id, project),
    staleTime: FRESH_MS,
    retry: false,
  } as const;
}
