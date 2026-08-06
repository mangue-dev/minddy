"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteResourceApi } from "./comments-api";
import type { Attachment, ResourceInput } from "./types";

const resourcesKey = (objectiveId: string) =>
  ["objective-resources", objectiveId] as const;

async function fetchObjectiveResources(objectiveId: string): Promise<Attachment[]> {
  const response = await fetch(`/api/objectives/${objectiveId}/resources`);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      (data as { error?: string } | null)?.error || "Request failed"
    );
  }
  return (data ?? []) as Attachment[];
}

/** Register already-added resources on an existing objective. */
export async function addObjectiveResourcesApi(
  objectiveId: string,
  resources: ResourceInput[]
): Promise<void> {
  const response = await fetch(`/api/objectives/${objectiveId}/resources`, {
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
 * Objective-LEVEL resources of the side panel (the ones on comments ride the
 * comments query). Twin of useIssueResources. Live updates come from the
 * realtime bridge invalidating ["objective-resources", objectiveId].
 */
export function useObjectiveResources(objectiveId: string | null) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: resourcesKey(objectiveId ?? ""),
    queryFn: () => fetchObjectiveResources(objectiveId as string),
    enabled: !!objectiveId,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: resourcesKey(objectiveId as string),
    });
  }, [objectiveId, queryClient]);

  const add = useCallback(
    async (resources: ResourceInput[]) => {
      await addObjectiveResourcesApi(objectiveId as string, resources);
      invalidate();
    },
    [objectiveId, invalidate]
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
