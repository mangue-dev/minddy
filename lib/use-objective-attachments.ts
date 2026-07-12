"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteAttachmentApi } from "./comments-api";
import type { Attachment, AttachmentInput } from "./types";

const attachmentsKey = (objectiveId: string) =>
  ["objective-attachments", objectiveId] as const;

async function fetchObjectiveAttachments(objectiveId: string): Promise<Attachment[]> {
  const response = await fetch(`/api/objectives/${objectiveId}/attachments`);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      (data as { error?: string } | null)?.error || "Request failed"
    );
  }
  return (data ?? []) as Attachment[];
}

/** Register already-uploaded files on an existing objective. */
export async function addObjectiveAttachmentsApi(
  objectiveId: string,
  attachments: AttachmentInput[]
): Promise<void> {
  const response = await fetch(`/api/objectives/${objectiveId}/attachments`, {
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
 * Objective-LEVEL attachments of the side panel (comment attachments ride the
 * comments query). Twin of useIssueAttachments. Live updates come from the
 * realtime bridge invalidating ["objective-attachments", objectiveId].
 */
export function useObjectiveAttachments(objectiveId: string | null) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: attachmentsKey(objectiveId ?? ""),
    queryFn: () => fetchObjectiveAttachments(objectiveId as string),
    enabled: !!objectiveId,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: attachmentsKey(objectiveId as string) });
  }, [objectiveId, queryClient]);

  const add = useCallback(
    async (attachments: AttachmentInput[]) => {
      await addObjectiveAttachmentsApi(objectiveId as string, attachments);
      invalidate();
    },
    [objectiveId, invalidate]
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
