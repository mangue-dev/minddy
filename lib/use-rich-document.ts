"use client";

// The editor document of an issue or objective description, or of the
// notebook (MIN-728),
// fetched next to the Markdown the surface already has.
//
// The Markdown stays the authority (lib/pages-markdown.ts, `documentForEditor`):
// this document only adds what Markdown cannot carry. A surface therefore never
// waits on it for long — a failed read opens the Markdown — and it is kept in
// memory only, like a page body.

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { JSONContent } from "@tiptap/core";

export type RichDocumentKind = "issue" | "objective" | "notebook";

export function richDocumentKey(kind: RichDocumentKind, id: string) {
  return ["rich-document", kind, id] as const;
}

export async function fetchRichDocument(
  kind: RichDocumentKind,
  id: string
): Promise<JSONContent | null> {
  const response = await fetch(
    `/api/documents/${kind}/${encodeURIComponent(id)}`,
    { cache: "no-store" }
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Unable to load the document");
  const data = (await response.json()) as { content?: JSONContent | null };
  return data.content ?? null;
}

/** Record what was just saved, so reopening the surface needs no read. */
export function setRichDocument(
  client: QueryClient,
  kind: RichDocumentKind,
  id: string,
  content: JSONContent | null
): void {
  client.setQueryData(richDocumentKey(kind, id), content);
}

/**
 * The stored document, or `undefined` while it loads. `null` = none, or the
 * read failed: the surface opens its Markdown either way.
 */
export function useRichDocument(
  kind: RichDocumentKind,
  id: string | null | undefined,
  { enabled = true }: { enabled?: boolean } = {}
): { document: JSONContent | null | undefined; remember: (content: JSONContent | null) => void } {
  const client = useQueryClient();
  const { data, isError } = useQuery({
    queryKey: richDocumentKey(kind, id ?? ""),
    queryFn: () => fetchRichDocument(kind, id!),
    enabled: enabled && !!id,
    staleTime: 30_000,
    retry: 1,
  });
  const remember = useCallback(
    (content: JSONContent | null) => {
      if (id) setRichDocument(client, kind, id, content);
    },
    [client, kind, id]
  );
  return { document: isError ? null : data, remember };
}
