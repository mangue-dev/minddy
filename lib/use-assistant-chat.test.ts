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
  it("restores the authoritative pending worker decision on reload", async () => {
    h.webFetch.mockResolvedValue(Response.json({
      status: "waiting_input",
      error_message: null,
      pending_input: {
        parent_numo_turn_id: "51700000-0000-4000-8000-000000000002",
        run_id: "51700000-0000-4000-8000-000000000003",
        question_id: "question-1",
        call_id: "call-question",
        questions: [],
        created_at: "2026-09-12T10:00:02.000Z",
      },
    }));
    await act(async () => root.render(createElement(Probe)));

    await act(async () => value.loadConversation(conversationId, null));

    expect(value.state.pendingWorkerInput).toEqual({
      parentTurnId: "51700000-0000-4000-8000-000000000002",
      runId: "51700000-0000-4000-8000-000000000003",
      questionId: "question-1",
    });
  });

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

  it("restores the conversation project when opened from a parent-work link", async () => {
    const linked = detail();
    linked.conversation.project_id = "project-from-detail";
    h.detail.mockResolvedValue(linked);
    await act(async () => root.render(createElement(Probe)));

    await act(async () => value.loadConversation(conversationId, null));

    expect(value.state.conversationProjectId).toBe("project-from-detail");
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

  it("sends the exact worker-question correlation with a card answer", async () => {
    h.webFetch.mockResolvedValue(new Response(
      'event: done\ndata: {"status":"waiting_work"}\n\n',
      { headers: { "X-Numo-Conversation-Id": conversationId } },
    ));
    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.loadConversation(conversationId, null));
    const workerInput = {
      parentTurnId: "51700000-0000-4000-8000-000000000002",
      runId: "51700000-0000-4000-8000-000000000003",
      questionId: "question-1",
    };

    await act(async () => value.sendMessage(null, "Use the public API.", { workerInput }));

    const request = h.webFetch.mock.calls.find(([url]) => url === "/api/assistant/chat")?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({ workerInput });
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

  it("reloads the launch tool result while a delegated worker runs", async () => {
    // A replayed journal never re-emits `tool_result`, so while the turn is
    // suspended on its worker the card can only learn the run id from the
    // persisted history. The poll must reload it once per suspension.
    let statusCalls = 0;
    h.webFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("/status")) {
        statusCalls += 1;
        return Response.json({
          status: statusCalls === 1 ? "waiting_work" : "idle",
          error_message: null,
          turn_id: "turn-1",
          active_run_id: "run-1",
          activity: [],
        });
      }
      if (String(url).includes("/messages")) {
        return Response.json([
          message("assistant-call", "assistant", "2026-09-12T10:00:01.000Z", {
            tool_calls: [{
              id: "call-launch",
              type: "function",
              function: { name: "launch_code_agent", arguments: "{}" },
            }],
          }),
          message("tool-result-launch", "tool", "2026-09-12T10:00:02.000Z", {
            content: JSON.stringify({ run_id: "run-1" }),
            tool_call_id: "call-launch",
            tool_name: "launch_code_agent",
            metadata: { success: true },
          }),
        ]);
      }
      return Response.json({ status: "idle", error_message: null });
    });

    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.loadConversation(conversationId, null));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

    expect(value.state.toolCallResults.get("call-launch")).toMatchObject({
      status: "complete",
      result: { run_id: "run-1" },
      success: true,
    });
    // The assistant handed the work to its agent: it reads as idle while the
    // delegated card carries the live state, not as "Traitement en cours…".
    expect(value.state.status).toBe("idle");
  });

  it("reconciles from durable state when the stream closes without a terminal event", async () => {
    // A proxy timeout or an evicted function closes the connection cleanly
    // but early: no `done`, no `error`. The reducer must not stay on
    // `streaming` forever — the authoritative status tells what actually
    // happened server-side.
    h.webFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("/api/assistant/chat")) {
        return new Response(
          'event: content_delta\ndata: {"delta":"partial"}\n\n',
          { headers: { "X-Numo-Conversation-Id": conversationId } },
        );
      }
      if (String(url).includes("/status")) {
        return Response.json({ status: "completed", error_message: null, activity: [] });
      }
      if (String(url).includes("/messages")) {
        return Response.json([message("final", "assistant", "2026-09-12T10:00:03.000Z")]);
      }
      return Response.json({ status: "idle", error_message: null });
    });

    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.sendMessage(null, "Hello"));

    expect(value.state.status).toBe("idle");
    expect(value.state.messages.at(-1)?.id).toBe("final");
  });

  it("keeps polling through a retryable turn instead of freezing on an error card", async () => {
    // The drain re-queues a retryable turn from its checkpoint within about a
    // minute, so polling must outlive it: the resumed round finishes and the
    // thread lands on the final history, not on a dead error card.
    let statusCalls = 0;
    h.webFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("/status")) {
        statusCalls += 1;
        return Response.json({
          status: statusCalls === 1 ? "retryable" : "completed",
          error_message: "The Numo process stopped before the turn reached its next durable boundary.",
          activity: [],
        });
      }
      if (String(url).includes("/messages")) {
        return Response.json([message("final", "assistant", "2026-09-12T10:00:03.000Z")]);
      }
      return Response.json({ status: "idle", error_message: null });
    });

    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.loadConversation(conversationId, null));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2600)); });

    expect(value.state.status).toBe("idle");
    expect(value.state.error).toBeNull();
    expect(value.state.messages.at(-1)?.id).toBe("final");
  });

  it("keeps polling through a retryable failure during the live request", async () => {
    // The FIRST in-request failure is not terminal either: the server emits
    // `error {status: "retryable"}` as the stream's terminal event and the
    // drain re-queues the turn from its checkpoint. No error card — polling
    // takes over until the resumed round answers.
    let statusCalls = 0;
    h.webFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("/api/assistant/chat")) {
        return new Response(
          'event: content_delta\ndata: {"delta":"partial"}\n\n'
            + 'event: error\ndata: {"message":"The Numo process stopped before the turn reached its next durable boundary.","status":"retryable"}\n\n',
          { headers: { "X-Numo-Conversation-Id": conversationId } },
        );
      }
      if (String(url).includes("/status")) {
        statusCalls += 1;
        return Response.json({
          status: statusCalls === 1 ? "retryable" : "completed",
          error_message: "The Numo process stopped before the turn reached its next durable boundary.",
          activity: [],
        });
      }
      if (String(url).includes("/messages")) {
        return Response.json([message("final", "assistant", "2026-09-12T10:00:03.000Z")]);
      }
      return Response.json({ status: "idle", error_message: null });
    });

    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.sendMessage(null, "Hello"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2600)); });

    expect(value.state.status).toBe("idle");
    expect(value.state.error).toBeNull();
    expect(value.state.messages.at(-1)?.id).toBe("final");
  });
});
