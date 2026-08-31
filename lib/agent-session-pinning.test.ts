import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { AgentSessionListItem } from "@/lib/agent-api";
import {
  allAgentSessionsQueryKey,
  patchAgentConversationPinnedInCache,
} from "@/lib/use-agent-runs";

function session(runId: string, pinned: boolean): AgentSessionListItem {
  return {
    conversationId: `conversation-${runId}`,
    runId,
    status: "completed",
    model: null,
    triggered_by: "button",
    title: runId,
    pr_number: null,
    pr_url: null,
    pr_state: null,
    created_at: "2026-08-31T12:00:00.000Z",
    updated_at: "2026-08-31T12:00:00.000Z",
    issue: null,
    pullRequest: null,
    project: null,
    working: false,
    pinned,
    lastCompletedAt: null,
    awaitingInput: false,
  };
}

describe("patchAgentConversationPinnedInCache", () => {
  it("updates the target immediately and returns its previous state", () => {
    const client = new QueryClient();
    client.setQueryData(allAgentSessionsQueryKey, {
      sessions: [session("run-1", false), session("run-2", false)],
    });

    expect(patchAgentConversationPinnedInCache(client, "run-1", true)).toBe(false);
    expect(
      client
        .getQueryData<{ sessions: AgentSessionListItem[] }>(allAgentSessionsQueryKey)
        ?.sessions.map(({ runId, pinned }) => ({ runId, pinned })),
    ).toEqual([
      { runId: "run-1", pinned: true },
      { runId: "run-2", pinned: false },
    ]);
  });

  it("can roll back one row without replacing changes to another", () => {
    const client = new QueryClient();
    client.setQueryData(allAgentSessionsQueryKey, {
      sessions: [session("run-1", false), session("run-2", false)],
    });

    const previous = patchAgentConversationPinnedInCache(client, "run-1", true);
    patchAgentConversationPinnedInCache(client, "run-2", true);
    patchAgentConversationPinnedInCache(client, "run-1", previous ?? false);

    expect(
      client
        .getQueryData<{ sessions: AgentSessionListItem[] }>(allAgentSessionsQueryKey)
        ?.sessions.map(({ runId, pinned }) => ({ runId, pinned })),
    ).toEqual([
      { runId: "run-1", pinned: false },
      { runId: "run-2", pinned: true },
    ]);
  });

  it("leaves an absent cache or session untouched", () => {
    const client = new QueryClient();
    expect(patchAgentConversationPinnedInCache(client, "missing", true)).toBeUndefined();

    client.setQueryData(allAgentSessionsQueryKey, { sessions: [session("run-1", false)] });
    expect(patchAgentConversationPinnedInCache(client, "missing", true)).toBeUndefined();
    expect(
      client.getQueryData<{ sessions: AgentSessionListItem[] }>(allAgentSessionsQueryKey),
    ).toEqual({ sessions: [session("run-1", false)] });
  });
});
