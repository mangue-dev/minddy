"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteResourceApi } from "./comments-api";
import type { Attachment, ResourceInput } from "./types";

const resourcesKey = (issueId: string) => ["issue-resources", issueId] as const;

async function fetchIssueResources(issueId: string): Promise<Attachment[]> {
  const response = await fetch(`/api/issues/${issueId}/resources`);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      (data as { error?: string } | null)?.error || "Request failed"
    );
  }
  return (data ?? []) as Attachment[];
}

/** Register already-added resources on an existing issue — files uploaded to
    storage, links resolved by /link-preview (also used by the kanban cards'
    drop target, which doesn't mount the query hook). */
export async function addIssueResourcesApi(
  issueId: string,
  resources: ResourceInput[]
): Promise<void> {
  const response = await fetch(`/api/issues/${issueId}/resources`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resources }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      (data as { error?: string } | null)?.error || "Request failed"
    );
  }
}

/**
 * Issue-LEVEL resources of the side panel (the ones on comments ride the
 * comments query). Live updates come from the realtime bridge invalidating
 * ["issue-resources", issueId].
 */
export function useIssueResources(issueId: string | null) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: resourcesKey(issueId ?? ""),
    queryFn: () => fetchIssueResources(issueId as string),
    enabled: !!issueId,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: resourcesKey(issueId as string) });
  }, [issueId, queryClient]);

  const add = useCallback(
    async (resources: ResourceInput[]) => {
      await addIssueResourcesApi(issueId as string, resources);
      invalidate();
    },
    [issueId, invalidate]
  );

  const remove = useCallback(
    async (resourceId: string) => {
      await deleteResourceApi(resourceId);
      invalidate();
    },
    [invalidate]
  );

  return { resources: data ?? [], add, remove };
}
