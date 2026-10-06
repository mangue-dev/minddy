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
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
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
  vi.useRealTimers();
});

describe("Numo conversation settings", () => {
  it("stops the known parent while a worker steering submission still awaits headers", async () => {
    const parentTurnId = "51700000-0000-4000-8000-000000000002";
    let finishSteering!: (response: Response) => void;
    let stopBody!: Record<string, unknown>;
    let requestId!: string;
    let stopped = false;
    h.webFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/assistant/chat") {
        requestId = JSON.parse(String(init?.body)).requestId;
        return new Promise<Response>((resolve) => { finishSteering = resolve; });
      }
      if (url === "/api/assistant/turns/stop") {
        stopBody = JSON.parse(String(init?.body));
        stopped = true;
        return Response.json({ turn_id: parentTurnId, status: "stopped" });
      }
      if (url.includes("/status")) return Response.json({
        status: stopped ? "stopped" : "waiting_work", turn_id: parentTurnId, activity: [],
      });
      if (url.includes("/messages")) return Response.json([]);
      throw new Error(`Unexpected request: ${url}`);
    });
    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.loadConversation(conversationId, null));
    let sending!: Promise<void>;
    await act(async () => { sending = value.sendMessage(null, "Steer the worker"); });
    await act(async () => { value.abort(); });
    expect(stopBody).toEqual({ requestId, conversationId, newConversation: false, turnId: parentTurnId });
    await act(async () => {
      finishSteering(new Response('event: done\ndata: {"status":"waiting_work"}\n\n', {
        headers: { "X-Numo-Conversation-Id": conversationId, "X-Numo-Turn-Id": parentTurnId },
      }));
      await sending;
    });
    expect(value.state.status).toBe("idle");
  });

  it("uses the exact parent turn returned by a mediated worker submission", async () => {
    const parentTurnId = "51700000-0000-4000-8000-000000000002";
    let stopBody!: Record<string, unknown>;
    let stopped = false;
    h.webFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/assistant/chat") return new Response(
        'event: done\ndata: {"status":"waiting_work"}\n\n',
        { headers: { "X-Numo-Conversation-Id": conversationId, "X-Numo-Turn-Id": parentTurnId } },
      );
      if (url === "/api/assistant/turns/stop") {
        stopBody = JSON.parse(String(init?.body));
        stopped = true;
        return Response.json({ turn_id: parentTurnId, status: "stopped" });
      }
      if (url.includes("/status")) return Response.json({
        status: stopped ? "stopped" : "idle", activity: [],
      });
      if (url.includes("/messages")) return Response.json([]);
      throw new Error(`Unexpected request: ${url}`);
    });
    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.loadConversation(conversationId, null));
    await act(async () => value.sendMessage(null, "Steer the worker"));
    await act(async () => { value.abort(); });
    expect(stopBody).toMatchObject({ conversationId, newConversation: false, turnId: parentTurnId });
    expect(value.state.status).toBe("idle");
  });

  it("records Stop by request identity before the first response headers without disconnecting its executor", async () => {
    let finishChat!: (response: Response) => void;
    let chatSignal!: AbortSignal;
    let chatBody!: { requestId: string; newConversationId: string };
    let stopBody!: { requestId: string; conversationId: string; newConversation: boolean };
    h.webFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/assistant/chat") {
        chatBody = JSON.parse(String(init?.body));
        chatSignal = init?.signal as AbortSignal;
        return new Promise<Response>((resolve) => { finishChat = resolve; });
      }
      if (url === "/api/assistant/turns/stop") {
        stopBody = JSON.parse(String(init?.body));
        return Response.json({ status: "stopped" });
      }
      if (url.includes("/status")) return Response.json({ status: "stopped", activity: [] });
      if (url.includes("/messages")) return Response.json([]);
      throw new Error(`Unexpected request: ${url}`);
    });
    await act(async () => root.render(createElement(Probe)));
    let sending!: Promise<void>;
    await act(async () => { sending = value.sendMessage(null, "Hello"); });
    expect(value.state.conversationId).toBeNull();
    await act(async () => { value.abort(); });
    expect(stopBody).toEqual({
      requestId: chatBody.requestId,
      conversationId: chatBody.newConversationId,
      newConversation: true,
    });
    expect(chatSignal.aborted).toBe(false);
    expect(value.state.status).toBe("idle");
    await act(async () => {
      finishChat(new Response('event: done\ndata: {"status":"stopped"}\n\n', {
        headers: { "X-Numo-Conversation-Id": chatBody.newConversationId },
      }));
      await sending;
    });
    expect(value.state.status).toBe("idle");
  });

  it("freezes queued stream deltas while waiting for the durable Stop receipt", async () => {
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    let finishStop!: (response: Response) => void;
    let chatSignal!: AbortSignal;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { streamController = controller; },
    });
    h.webFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/assistant/chat") {
        chatSignal = init?.signal as AbortSignal;
        return new Response(body, { headers: { "X-Numo-Conversation-Id": conversationId } });
      }
      if (url === "/api/assistant/turns/stop") {
        return new Promise<Response>((resolve) => { finishStop = resolve; });
      }
      if (url.includes("/status")) return Response.json({ status: "stopped", activity: [] });
      if (url.includes("/messages")) return Response.json([]);
      throw new Error(`Unexpected request: ${url}`);
    });
    await act(async () => root.render(createElement(Probe)));
    let sending!: Promise<void>;
    await act(async () => { sending = value.sendMessage(null, "Hello"); });
    await act(async () => { value.abort(); });
    await act(async () => {
      streamController.enqueue(new TextEncoder().encode('event: content_delta\ndata: {"delta":"late text"}\n\n'));
    });
    expect(chatSignal.aborted).toBe(false);
    expect(value.state.status).toBe("idle");
    expect(value.state.streamingContent).toBe("");
    await act(async () => { finishStop(Response.json({ status: "stopped" })); });
    await act(async () => {
      streamController.enqueue(new TextEncoder().encode('event: done\ndata: {"status":"stopped"}\n\n'));
      streamController.close();
      await sending;
    });
    expect(value.state.status).toBe("idle");
  });

  it("keeps Stop available when the server rejects cancellation", async () => {
    let finishChat!: (response: Response) => void;
    h.webFetch.mockImplementation(async (url: string) => {
      if (url === "/api/assistant/chat") {
        return new Promise<Response>((resolve) => { finishChat = resolve; });
      }
      if (url === "/api/assistant/turns/stop") {
        return Response.json({ error: "Stop request failed" }, { status: 409 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    await act(async () => root.render(createElement(Probe)));
    let sending!: Promise<void>;
    await act(async () => { sending = value.sendMessage(null, "Hello"); });
    await act(async () => { value.abort(); });
    expect(value.state.status).toBe("generating_server");
    expect(value.state.error).toBe("Stop request failed");
    await act(async () => { value.abort(); });
    expect(h.webFetch.mock.calls.filter(([url]) => url === "/api/assistant/turns/stop")).toHaveLength(2);
    await act(async () => {
      finishChat(new Response('event: done\ndata: {"status":"stopped"}\n\n'));
      await sending;
    });
  });

  it("reconciles a loaded turn that completed just before the conversation-wide Stop", async () => {
    let stopped = false;
    h.webFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/turn")) {
        stopped = true;
        return Response.json({ error: "No active turn" }, { status: 409 });
      }
      if (url.includes("/status")) return Response.json({
        status: stopped ? "completed" : "running", activity: [],
      });
      if (url.includes("/messages")) return Response.json([]);
      throw new Error(`Unexpected request: ${url}`);
    });
    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.loadConversation(conversationId, null));
    await act(async () => { value.abort(); });
    expect(value.state.status).toBe("idle");
    expect(value.state.error).toBeNull();
  });

  it("keeps a stopped executor connected after Reset and ignores its late headers", async () => {
    let finishChat!: (response: Response) => void;
    let chatSignal!: AbortSignal;
    let prospectiveConversationId!: string;
    h.webFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/assistant/chat") {
        chatSignal = init?.signal as AbortSignal;
        prospectiveConversationId = JSON.parse(String(init?.body)).newConversationId;
        return new Promise<Response>((resolve) => { finishChat = resolve; });
      }
      if (url === "/api/assistant/turns/stop") return Response.json({ status: "stopped" });
      if (url.includes("/status")) return Response.json({ status: "stopped", activity: [] });
      if (url.includes("/messages")) return Response.json([]);
      throw new Error(`Unexpected request: ${url}`);
    });
    await act(async () => root.render(createElement(Probe)));
    let sending!: Promise<void>;
    await act(async () => { sending = value.sendMessage(null, "Hello"); });
    await act(async () => { value.abort(); });
    await act(async () => { value.reset(); });
    expect(chatSignal.aborted).toBe(false);
    await act(async () => {
      finishChat(new Response('event: done\ndata: {"status":"stopped"}\n\n', {
        headers: { "X-Numo-Conversation-Id": prospectiveConversationId },
      }));
      await sending;
    });
    expect(value.state.conversationId).toBeNull();
    expect(value.state.messages).toEqual([]);
    expect(value.state.status).toBe("idle");
  });

  it("does not let a delayed Stop response or old headers overwrite a newer request", async () => {
    let finishOldChat!: (response: Response) => void;
    let finishOldStop!: (response: Response) => void;
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const newStream = new ReadableStream<Uint8Array>({
      start(controller) { streamController = controller; },
    });
    const chats: Array<{ requestId: string; newConversationId: string }> = [];
    h.webFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/assistant/chat") {
        const body = JSON.parse(String(init?.body));
        chats.push(body);
        if (chats.length === 1) return new Promise<Response>((resolve) => { finishOldChat = resolve; });
        return new Response(newStream, { headers: { "X-Numo-Conversation-Id": body.newConversationId } });
      }
      if (url === "/api/assistant/turns/stop") {
        return new Promise<Response>((resolve) => { finishOldStop = resolve; });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    await act(async () => root.render(createElement(Probe)));
    let oldSending!: Promise<void>;
    let newSending!: Promise<void>;
    await act(async () => { oldSending = value.sendMessage(null, "Old request"); });
    await act(async () => { value.abort(); });
    await act(async () => { newSending = value.sendMessage(null, "New request"); });
    await act(async () => {
      streamController.enqueue(new TextEncoder().encode('event: content_delta\ndata: {"delta":"new text"}\n\n'));
    });
    await act(async () => {
      finishOldStop(Response.json({ status: "stopped" }));
      finishOldChat(new Response('event: done\ndata: {"status":"stopped"}\n\n', {
        headers: { "X-Numo-Conversation-Id": chats[0].newConversationId },
      }));
      await oldSending;
    });
    expect(value.state.conversationId).toBe(chats[1].newConversationId);
    expect(value.state.streamingContent).toBe("new text");
    expect(value.state.status).toBe("streaming");
    await act(async () => {
      streamController.enqueue(new TextEncoder().encode(
        'event: message_complete\ndata: {"message_id":"new-final"}\n\n'
        + 'event: done\ndata: {"status":"completed"}\n\n',
      ));
      streamController.close();
      await newSending;
    });
    expect(value.state.messages.at(-1)?.content).toBe("new text");
  });

  it("renders fragmented SSE text before the response finishes", async () => {
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { streamController = controller; },
    });
    h.webFetch.mockResolvedValue(new Response(body, {
      headers: { "X-Numo-Conversation-Id": conversationId },
    }));
    await act(async () => root.render(createElement(Probe)));
    let sending!: Promise<void>;
    await act(async () => { sending = value.sendMessage(null, "Hello"); });
    await act(async () => {
      streamController.enqueue(new TextEncoder().encode("event: content_delta\n"));
    });
    await act(async () => {
      streamController.enqueue(new TextEncoder().encode('data: {"delta":"first token"}\n\n'));
    });
    expect(value.state.status).toBe("streaming");
    expect(value.state.streamingContent).toBe("first token");
    await act(async () => {
      streamController.enqueue(new TextEncoder().encode(
        'event: message_complete\ndata: {"message_id":"final"}\n\n'
        + 'event: done\ndata: {"status":"completed"}\n\n',
      ));
      streamController.close();
      await sending;
    });
    expect(value.state.messages.at(-1)?.content).toBe("first token");
    expect(value.state.status).toBe("idle");
  });

  it("ignores a status request from before Stop instead of replaying late text", async () => {
    let finishOldPoll!: (response: Response) => void;
    const oldPoll = new Promise<Response>((resolve) => { finishOldPoll = resolve; });
    let statusCalls = 0;
    h.webFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/turn")) return Response.json({ turn_id: "turn-1", status: "stopped" });
      if (url.includes("/status")) {
        statusCalls += 1;
        if (statusCalls === 1) return Response.json({ status: "running", activity: [] });
        if (statusCalls === 2) return oldPoll;
        return Response.json({ status: "stopped", activity: [] });
      }
      if (url.includes("/messages")) return Response.json([]);
      throw new Error(`Unexpected request: ${url}`);
    });
    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.loadConversation(conversationId, null));
    await act(async () => { value.abort(); });
    await act(async () => {
      finishOldPoll(Response.json({
        status: "running",
        activity: [{ seq: 1, type: "content_delta", payload: { delta: "late text" } }],
      }));
    });
    expect(value.state.status).toBe("idle");
    expect(value.state.streamingContent).toBe("");
  });

  it("does not restart polling from a connection-loss reconciliation that Stop superseded", async () => {
    let finishReconciliation!: (response: Response) => void;
    let statusCalls = 0;
    h.webFetch.mockImplementation(async (url: string) => {
      if (url === "/api/assistant/chat") return new Response("", {
        headers: { "X-Numo-Conversation-Id": conversationId },
      });
      if (url === "/api/assistant/turns/stop") return Response.json({ status: "stopped" });
      if (url.includes("/status")) {
        statusCalls += 1;
        if (statusCalls === 1) return new Promise<Response>((resolve) => { finishReconciliation = resolve; });
        return Response.json({ status: "stopped", activity: [] });
      }
      if (url.includes("/messages")) return Response.json([]);
      throw new Error(`Unexpected request: ${url}`);
    });
    await act(async () => root.render(createElement(Probe)));
    let sending!: Promise<void>;
    await act(async () => { sending = value.sendMessage(null, "Hello"); });
    await act(async () => { value.abort(); });
    const callsAfterStop = statusCalls;
    await act(async () => {
      finishReconciliation(Response.json({ status: "running", activity: [] }));
      await sending;
    });
    expect(statusCalls).toBe(callsAfterStop);
    expect(value.state.status).toBe("idle");
  });

  it("does not project journal text during post-Stop reconciliation while history is still loading", async () => {
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    let finishMessages!: (response: Response) => void;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { streamController = controller; },
    });
    h.webFetch.mockImplementation(async (url: string) => {
      if (url === "/api/assistant/chat") return new Response(stream, {
        headers: { "X-Numo-Conversation-Id": conversationId },
      });
      if (url === "/api/assistant/turns/stop") return Response.json({ status: "stopped" });
      if (url.includes("/status")) return Response.json({
        status: "stopped",
        activity: [
          { seq: 1, type: "content_delta", payload: { delta: "post-Stop text" } },
          { seq: 2, type: "reasoning_start", payload: {} },
          { seq: 3, type: "reasoning_delta", payload: { text: "post-Stop reasoning" } },
        ],
      });
      if (url.includes("/messages")) return new Promise<Response>((resolve) => { finishMessages = resolve; });
      throw new Error(`Unexpected request: ${url}`);
    });
    await act(async () => root.render(createElement(Probe)));
    let sending!: Promise<void>;
    await act(async () => { sending = value.sendMessage(null, "Hello"); });
    await act(async () => { value.abort(); });
    expect(value.state.status).toBe("idle");
    expect(value.state.streamingContent).toBe("");
    expect(value.state.streamingReasoning).toBeNull();
    await act(async () => {
      finishMessages(Response.json([]));
      streamController.enqueue(new TextEncoder().encode('event: done\ndata: {"status":"stopped"}\n\n'));
      streamController.close();
      await sending;
    });
    expect(value.state.status).toBe("idle");
  });

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
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });

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
    await act(async () => { await vi.advanceTimersByTimeAsync(2600); });

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
    await act(async () => { await vi.advanceTimersByTimeAsync(2600); });

    expect(value.state.status).toBe("idle");
    expect(value.state.error).toBeNull();
    expect(value.state.messages.at(-1)?.id).toBe("final");
  });

  it("idles the thread instantly on stop and still records the durable stop", async () => {
    // Reference experience: pressing stop must freeze the thread at once,
    // not keep a busy presentation until polling confirms. The durable stop
    // must still be sent, quietly reconciled afterwards.
    const fetches: string[] = [];
    let stopPosted = false;
    h.webFetch.mockImplementation(async (url: string, init?: { body?: string }) => {
      fetches.push(String(url));
      if (String(url).endsWith("/turns/stop")) {
        stopPosted = true;
        expect(JSON.parse(String(init?.body))).toMatchObject({ conversationId, newConversation: false });
        return Response.json({ turn_id: "turn-1", status: "stopping" });
      }
      if (String(url).includes("/status")) {
        return Response.json({ status: stopPosted ? "stopped" : "running", error_message: null, activity: [] });
      }
      if (String(url).includes("/messages")) {
        return Response.json([message("final", "assistant", "2026-09-12T10:00:03.000Z")]);
      }
      return Response.json({ status: "idle", error_message: null });
    });

    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.loadConversation(conversationId, null));
    await act(async () => value.sendMessage(null, "Hang the stream, then answer"));
    // The stream closed without a terminal event: reconciliation rode in.

    await act(async () => { value.abort(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });

    expect(value.state.status).toBe("idle");
    expect(stopPosted).toBe(true);
  });

  it("restores the busy presentation when the authoritative turn keeps running", async () => {
    // The optimistic idle must not stick if the stop did not win: a turn
    // that is still running means the composer freezes misleadingly.
    h.webFetch.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/turns/stop")) {
        return Response.json({ turn_id: "turn-1", status: "stopping" });
      }
      if (String(url).includes("/api/assistant/chat")) {
        return new Response(
          'event: content_delta\ndata: {"delta":"partial"}\n\n',
          { headers: { "X-Numo-Conversation-Id": conversationId } },
        );
      }
      if (String(url).includes("/status")) {
        return Response.json({ status: "running", error_message: null, activity: [] });
      }
      if (String(url).includes("/messages")) {
        return Response.json([message("final", "assistant", "2026-09-12T10:00:03.000Z")]);
      }
      return Response.json({ status: "idle", error_message: null });
    });
    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.loadConversation(conversationId, null));
    await act(async () => value.sendMessage(null, "Hello"));
    await act(async () => { value.abort(); });
    // Quiet poll observed the still-running turn: back to the busy card.
    expect(value.state.status).toBe("generating_server");
  });
});


describe("completed response notifications", () => {
  it.each(["completed", "waiting_input", "idle"])("marks a successful %s streamed answer ready", async (status) => {
    h.webFetch.mockResolvedValue(new Response(
      'event: content_delta\ndata: {"delta":"Ready answer"}\n\n'
      + 'event: message_complete\ndata: {"message_id":"answer"}\n\n'
      + `event: done\ndata: {"status":"${status}"}\n\n`,
      { headers: { "X-Numo-Conversation-Id": conversationId } },
    ));
    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.sendMessage(null, "Question"));
    expect(value.state.completedResponse).toEqual({ conversationId, messageId: "answer" });
    await act(async () => value.reset());
    expect(value.state.completedResponse).toBeNull();
  });

  it.each(["stopped", "failed"])("does not mark a %s partial answer ready", async (status) => {
    h.webFetch.mockResolvedValue(new Response(
      'event: content_delta\ndata: {"delta":"Partial answer"}\n\n'
      + 'event: message_complete\ndata: {"message_id":"partial"}\n\n'
      + `event: ${status === "failed" ? "error" : "done"}\ndata: {"status":"${status}","message":"Failed"}\n\n`,
      { headers: { "X-Numo-Conversation-Id": conversationId } },
    ));
    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.sendMessage(null, "Question"));
    expect(value.state.completedResponse).toBeNull();
  });

  it.each(["ask_user", "propose_backlog"])("marks a completed %s interaction ready", async (name) => {
    h.webFetch.mockResolvedValue(new Response(
      `event: tool_call_start\ndata: {"id":"call","name":"${name}"}\n\n`
      + `event: tool_call_complete\ndata: {"id":"call","name":"${name}","arguments":"{}"}\n\n`
      + 'event: message_complete\ndata: {"message_id":"interaction"}\n\n'
      + 'event: done\ndata: {"status":"waiting_input"}\n\n',
      { headers: { "X-Numo-Conversation-Id": conversationId } },
    ));
    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.sendMessage(null, "Question"));
    expect(value.state.completedResponse).toEqual({ conversationId, messageId: "interaction" });
  });

  it("does not mark an empty completed turn ready", async () => {
    h.webFetch.mockResolvedValue(new Response(
      'event: done\ndata: {"status":"completed"}\n\n',
      { headers: { "X-Numo-Conversation-Id": conversationId } },
    ));
    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.sendMessage(null, "Question"));
    expect(value.state.completedResponse).toBeNull();
  });

  it.each(["poll", "connection recovery"])("marks an answer ready after %s reloads final messages", async (path) => {
    const answer = message("persisted-answer", "assistant", "2026-09-12T10:01:00.000Z", { content: "Final answer" });
    h.webFetch.mockImplementation(async (url: string) => {
      if (url === "/api/assistant/chat") {
        return new Response(path === "poll" ? 'event: done\ndata: {"status":"waiting_work"}\n\n' : "", {
          headers: { "X-Numo-Conversation-Id": conversationId },
        });
      }
      if (url.includes("/status")) return Response.json({ status: "completed", activity: [] });
      if (url.includes("/messages")) return Response.json([answer]);
      throw new Error(`Unexpected request: ${url}`);
    });
    await act(async () => root.render(createElement(Probe)));
    await act(async () => value.sendMessage(null, "Question"));
    expect(value.state.completedResponse).toEqual({ conversationId, messageId: answer.id });
  });
});
