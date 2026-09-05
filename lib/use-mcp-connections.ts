"use client";

import { useQuery } from "@tanstack/react-query";
import type { McpConnection } from "@/lib/mcp-client";

export const MCP_CONNECTIONS_QUERY_KEY = ["account-mcp-connections"];

/** Share account metadata between settings and the Numo composer. */
export function useMcpConnections(userId: string | undefined) {
  return useQuery<{
    connections: McpConnection[];
    callback_url: string;
  }>({
    queryKey: [...MCP_CONNECTIONS_QUERY_KEY, userId],
    enabled: !!userId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const response = await fetch("/api/account/mcp-connections");
      if (!response.ok) throw new Error("Could not load MCP connections");
      return response.json();
    },
  });
}
