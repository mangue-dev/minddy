"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteAttachmentApi } from "./comments-api";
import type { Attachment, AttachmentInput } from "./types";

const attachmentsKey = (issueId: string) => ["issue-attachments", issueId] as const;

async function fetchIssueAttachments(issueId: string): Promise<Attachment[]> {
  const response = await fetch(`/api/issues/${issueId}/attachments`);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      (data as { error?: string } | null)?.error || "Request failed"
    );
  }
  return (data ?? []) as Attachment[];
}

/** Register already-uploaded files on an existing issue (also used by the
    kanban cards' drop target, which doesn't mount the query hook). */
export async function addIssueAttachmentsApi(
  issueId: string,
  attachments: AttachmentInput[]
): Promise<void> {
  const response = await fetch(`/api/issues/${issueId}/attachments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attachments }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      (data as { error?: string } | null)?.error || "Request failed"
    );
  }
}

/**
 * Issue-LEVEL attachments of the side panel (comment attachments ride the
 * comments query). Live updates come from the realtime bridge invalidating
 * ["issue-attachments", issueId].
 */
export function useIssueAttachments(issueId: string | null) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: attachmentsKey(issueId ?? ""),
    queryFn: () => fetchIssueAttachments(issueId as string),
    enabled: !!issueId,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: attachmentsKey(issueId as string) });
  }, [issueId, queryClient]);

  const add = useCallback(
    async (attachments: AttachmentInput[]) => {
      await addIssueAttachmentsApi(issueId as string, attachments);
      invalidate();
    },
    [issueId, invalidate]
  );

  const remove = useCallback(
    async (attachmentId: string) => {
      await deleteAttachmentApi(attachmentId);
      invalidate();
    },
    [invalidate]
  );

  return { attachments: data ?? [], add, remove };
}
