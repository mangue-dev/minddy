// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NumoConversationDetail, NumoMessage } from "./assistant-types";

const h = vi.hoisted(() => ({
  detail: vi.fn(),
  update: vi.fn(),
  webFetch: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("./analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("./routine-schedule", () => ({ browserTimezone: () => "UTC" }));
vi.mock("./assistant-api", () => ({
  fetchNumoConversation: h.detail,
  updateConversationWithResult: h.update,
}));

import { useAssistantChat } from "./use-assistant-chat";

const conversationId = "51700000-0000-4000-8000-000000000001";
let root: Root;
let value: ReturnType<typeof useAssistantChat>;

function message(
  id: string,
  role: NumoMessage["role"],
  createdAt: string,
  extra: Partial<NumoMessage> = {},
): NumoMessage {
  return {
    id,
    conversation_id: conversationId,
    source: "assistant",
    kind: role === "tool" ? "action" : "message",
    role,
    content: null,
    tool_calls: null,
    tool_call_id: null,
    tool_name: null,
    metadata: {},
    turn_id: null,
    run_id: null,
    worker_source: null,
    legacy_queue_message_id: null,
    legacy_event_id: null,
    created_at: createdAt,
    ...extra,
  };
}

function detail(): NumoConversationDetail {
  return {
    conversation: {
      id: conversationId,
      user_id: "user",
      source: "assistant",
      legacy_id: conversationId,
      project_id: null,
      access_project_id: null,
      visibility: "private",
      title: null,
      status: "idle",
      error_message: null,
      archived_at: null,
      pinned_at: null,
      last_read_at: null,
      detail_href: null,
      latest_work_id: null,
      created_at: "2026-09-12T10:00:00.000Z",
      updated_at: "2026-09-12T10:00:00.000Z",
      model: "chosen-model",
      reasoning_level: "high",
    },
    messages: [
      message("assistant-call", "assistant", "2026-09-12T10:00:01.000Z", {
        tool_calls: [{
          id: "call-1",
          type: "function",
          function: { name: "list_issues", arguments: "{}" },
        }],
      }),
    ],
    actions: [
      message("tool-result", "tool", "2026-09-12T10:00:02.000Z", {
        content: JSON.stringify({ issues: ["MIN-517"] }),
        tool_call_id: "call-1",
        tool_name: "list_issues",
        metadata: { success: true },
      }),
    ],
    work: [],
    contexts: [],
    artifacts: [],
    turns: [],
  };
}

function Probe() {
  value = useAssistantChat();
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: h.webFetch,
  });
  h.detail.mockResolvedValue(detail());
  h.update.mockResolvedValue({ ok: true });
  h.webFetch.mockResolvedValue(Response.json({ status: "idle", error_message: null }));
  root = createRoot(document.createElement("div"));
});

afterEach(() => {
  act(() => root.unmount());
});

describe("Numo conversation settings", () => {
  it("restores persisted settings and tool results from the unified detail", async () => {
    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.loadConversation(conversationId, null));

    expect(value.state.conversationModel).toBe("chosen-model");
    expect(value.state.conversationReasoningLevel).toBe("high");
    expect(value.state.messages.map((entry) => entry.id)).toEqual([
      "assistant-call",
      "tool-result",
    ]);
    expect(value.state.toolCallResults.get("call-1")).toMatchObject({
      status: "complete",
      result: { issues: ["MIN-517"] },
      success: true,
    });
  });

  it("sends explicit null choices so an in-flight reset cannot reuse stale persistence", async () => {
    h.webFetch.mockResolvedValue(new Response(
      'event: done\ndata: {"status":"completed"}\n\n',
      { headers: { "X-Numo-Conversation-Id": conversationId } },
    ));
    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.sendMessage(null, "Hello"));

    const request = h.webFetch.mock.calls.find(([url]) => url === "/api/assistant/chat")?.[1];
    const body = JSON.parse(String(request?.body));
    expect(body).toMatchObject({ model: null, reasoningLevel: null });
  });

  it("rolls back simultaneous failed writes to the last server-confirmed settings", async () => {
    h.update.mockResolvedValue({ ok: false, error: "Unable to save" });
    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.loadConversation(conversationId, null));

    await act(async () => {
      const first = value.updateConversationConfig({ model: "model-b" });
      const second = value.updateConversationConfig({ reasoningLevel: "low" });
      await Promise.all([first, second]);
    });

    expect(value.state).toMatchObject({
      conversationModel: "chosen-model",
      conversationReasoningLevel: "high",
      conversationConfigError: "Unable to save",
    });
  });
});
