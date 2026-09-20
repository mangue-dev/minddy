"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { McpRegistryServer } from "@/lib/mcp-registry";

/** Debounced query, shared by the hook and the "no results" state of the UI. */
export const MCP_REGISTRY_SEARCH_DEBOUNCE_MS = 350;

/** Below this the registry says nothing: presets alone answer short queries. */
export const MCP_REGISTRY_SEARCH_MIN_LENGTH = 2;

export function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Live search into the public MCP registry (MIN-586), debounced and cached
 * per query. The section is hidden while pending — presets answer faster,
 * and a half-arrived registry page would flicker under the user's typing.
 */
export function useMcpRegistrySearch(query: string) {
  const debounced = useDebouncedValue(
    query,
    MCP_REGISTRY_SEARCH_DEBOUNCE_MS,
  );
  const active = debounced.trim().length >= MCP_REGISTRY_SEARCH_MIN_LENGTH;
  const search = useQuery<{ servers: McpRegistryServer[] }>({
    queryKey: ["mcp-registry-search", debounced.trim()],
    enabled: active,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const response = await fetch(
        `/api/mcp-registry?q=${encodeURIComponent(debounced.trim())}`,
      );
      if (!response.ok) throw new Error("registry search failed");
      return response.json();
    },
  });
  return {
    /** The settled query the results answer, so the UI can detect staleness. */
    debounced,
    servers: search.data?.servers,
    isPending: active && search.isPending,
    hasError: active && search.isError,
  };
}
