"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeAgentModelCatalog } from "./native-agent-models";
import { NativePrototypeRequestError, safeNativeErrorCode } from "./native-agent-prototype-api";

type NativeEngine = "codex" | "claude_code";

export const nativeAgentModelsQueryKey = (engine: NativeEngine) =>
  ["native-agent-models", engine] as const;

/** Fetch safe catalog metadata only; authentication never enters browser queries. */
async function requestCatalog(engine: NativeEngine, refresh = false) {
  const response = await fetch(`/api/account/agent-connections/${engine}/models`, {
    method: refresh ? "POST" : "GET",
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const code = body && typeof body === "object" && "errorCode" in body
      ? safeNativeErrorCode(body.errorCode) : null;
    throw new NativePrototypeRequestError(code);
  }
  return response.json() as Promise<NativeAgentModelCatalog>;
}

export function useNativeAgentModelsQuery(engine: NativeEngine, enabled: boolean) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: nativeAgentModelsQueryKey(engine),
    queryFn: () => requestCatalog(engine),
    enabled,
    retry: false,
    staleTime: 30_000,
  });
  const refresh = useMutation({
    mutationFn: () => requestCatalog(engine, true),
    onSuccess: (catalog) => client.setQueryData(nativeAgentModelsQueryKey(engine), catalog),
  });
  return { ...query, refresh };
}
