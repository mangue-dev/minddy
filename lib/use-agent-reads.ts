"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth-context";
import { fetchAgentReadsApi, markAgentSessionReadApi } from "./agent-api";

/**
 * “Read” status of agent sessions (“completed, unread” blue bubble). A card
 * { conversationId → last_read_at } shared by all surfaces (list /agents, badge
 * sidebar, runs selector). `markRead` stamps NOW, optimistically,
 * to empty the bubble without waiting for the server round-trip.
 */

const AGENT_READS_KEY = ["agent-reads"] as const;

type ReadsData = { reads: Record<string, string> };

// Duplicate competing POSTs for the same conversation (several surfaces can
// trigger the mark-read on opening) — at module level, shared between instances.
const inFlight = new Set<string>();

export function useAgentReads() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data } = useQuery({
    queryKey: AGENT_READS_KEY,
    queryFn: fetchAgentReadsApi,
    enabled: !!userId,
  });

  const reads = useMemo(() => data?.reads ?? {}, [data]);

  const markRead = useCallback(
    (conversationId: string) => {
      if (!conversationId) return;
      const now = new Date().toISOString();
      const previous = queryClient.getQueryData<ReadsData>(AGENT_READS_KEY);
      // Optimistic: advances the reading cursor immediately (empty bubble on the
      // list + the sidebar badge). Always safe — `now` is after all ends.
      queryClient.setQueryData<ReadsData>(AGENT_READS_KEY, (old) => ({
        reads: { ...old?.reads, [conversationId]: now },
      }));
      if (inFlight.has(conversationId)) return;
      inFlight.add(conversationId);
      void markAgentSessionReadApi(conversationId)
        .catch(() => {
          // Network failure → rollback; the next refetch will reconcile anyway.
          queryClient.setQueryData<ReadsData>(AGENT_READS_KEY, previous);
        })
        .finally(() => inFlight.delete(conversationId));
    },
    [queryClient],
  );

  return { reads, markRead };
}
