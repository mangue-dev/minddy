"use client";

import { useCallback, useReducer, useRef } from "react";
import { useTranslations } from "next-intl";
import { browserTimezone } from "./routine-schedule";
import type {
  AssistantCommandId,
  AssistantMention,
  AssistantMessage,
  AssistantToolCall,
  AssistantChatRequest,
  AssistantPageContext,
  ConversationStatus,
} from "./assistant-types";
import type { FileResourceInput, ResourceInput } from "./types";
import { trackEvent } from "./analytics";
import { durationBucket, errorReason, lengthBucket } from "./analytics-sanitize";
import type { AssistantReasoning } from "./assistant-reasoning";

// ── State ──────────────────────────────────────────────────────────────

export type AssistantStatus =
  | "idle"
  | "streaming"
  | "executing_tool"
  | "generating_server"
  | "error";

interface ActiveToolCall {
  id: string;
  name: string;
  arguments: string;
  status: "running" | "complete";
  result?: unknown;
  success?: boolean;
}

export interface StreamingAssistantReasoning extends AssistantReasoning {
  active: boolean;
}

type ToolCallResult = {
  status: "running" | "complete";
  result?: unknown;
  success?: boolean;
};

function buildToolCallResultsFromMessages(messages: AssistantMessage[]): Map<string, ToolCallResult> {
  const toolCallResults = new Map<string, ToolCallResult>();

  for (const message of messages) {
    if (message.role !== "tool" || !message.tool_call_id) continue;

    let result: unknown = undefined;
    if (message.content) {
      try {
        result = JSON.parse(message.content);
      } catch {
        result = message.content;
      }
    }
    // A result too big for the travel model on the metadata: `content`
    // then only carries the summary which it rereads, and the screen needs the whole (the
    // primer proposal and its forty titles, MIN-173).
    const stored = (message.metadata as { result?: unknown } | null)?.result;
    if (stored !== undefined) result = stored;

    toolCallResults.set(message.tool_call_id, {
      status: "complete",
      result,
      success:
        typeof message.metadata?.success === "boolean"
          ? (message.metadata.success as boolean)
          : true,
    });
  }

  return toolCallResults;
}

export interface AssistantChatState {
  status: AssistantStatus;
  messages: AssistantMessage[];
  streamingContent: string;
  streamingReasoning: StreamingAssistantReasoning | null;
  activeToolCalls: ActiveToolCall[];
  toolCallResults: Map<string, ToolCallResult>;
  conversationId: string | null;
  /**
 * The living conversation project (`null` = global conversation). Frozen
 * upon its creation, it travels with it: it is HE who sets the scope of Numo,
 * plus the current URL (MIN-353, cf. lib/assistant-scope.ts).
 */
  conversationProjectId: string | null;
  error: string | null;
}

const initialState: AssistantChatState = {
  status: "idle",
  messages: [],
  streamingContent: "",
  streamingReasoning: null,
  activeToolCalls: [],
  toolCallResults: new Map(),
  conversationId: null,
  conversationProjectId: null,
  error: null,
};

// ── Actions ────────────────────────────────────────────────────────────

type Action =
  | { type: "START_STREAMING" }
  | {
      type: "SET_CONVERSATION_ID";
      conversationId: string;
      projectId: string | null;
    }
  | { type: "CONTENT_DELTA"; delta: string }
  | { type: "REASONING_START" }
  | { type: "REASONING_TICK"; durationMs: number }
  | { type: "REASONING_END"; durationMs: number; text: string }
  | { type: "TOOL_CALL_START"; id: string; name: string }
  | { type: "TOOL_CALL_ARGS_DELTA"; id: string; delta: string }
  | {
      type: "TOOL_CALL_COMPLETE";
      id: string;
      name: string;
      arguments: string;
    }
  | {
      type: "TOOL_RESULT";
      id: string;
      name: string;
      result: unknown;
      success: boolean;
    }
  | { type: "MESSAGE_COMPLETE"; messageId: string }
  | {
      type: "ADD_USER_MESSAGE";
      content: string;
      context?: AssistantPageContext | null;
      attachments?: ResourceInput[];
      mentions?: AssistantMention[];
    }
  | { type: "DONE" }
  | { type: "GENERATING_SERVER" }
  | { type: "ERROR"; message: string }
  | {
      type: "LOAD_HISTORY";
      messages: AssistantMessage[];
      conversationId: string;
      projectId: string | null;
    }
  | { type: "RESET" };

function reducer(
  state: AssistantChatState,
  action: Action
): AssistantChatState {
  switch (action.type) {
    case "START_STREAMING":
      return {
        ...state,
        status: "streaming",
        streamingContent: "",
        streamingReasoning: null,
        activeToolCalls: [],
        error: null,
      };

    case "SET_CONVERSATION_ID":
      return {
        ...state,
        conversationId: action.conversationId,
        conversationProjectId: action.projectId,
      };

    case "CONTENT_DELTA":
      return {
        ...state,
        status: "streaming",
        streamingContent: state.streamingContent + action.delta,
      };

    case "REASONING_START":
      return {
        ...state,
        status: "streaming",
        streamingReasoning: { active: true, text: "", durationMs: 0 },
      };

    case "REASONING_TICK":
      if (!state.streamingReasoning?.active) return state;
      return {
        ...state,
        streamingReasoning: {
          ...state.streamingReasoning,
          durationMs: Math.max(
            state.streamingReasoning.durationMs,
            action.durationMs,
          ),
        },
      };

    case "REASONING_END":
      if (!state.streamingReasoning) return state;
      return {
        ...state,
        streamingReasoning: {
          ...state.streamingReasoning,
          active: false,
          text: action.text,
          durationMs: Math.max(
            state.streamingReasoning.durationMs,
            action.durationMs,
          ),
        },
      };

    case "TOOL_CALL_START":
      return {
        ...state,
        status: "executing_tool",
        activeToolCalls: [
          ...state.activeToolCalls,
          {
            id: action.id,
            name: action.name,
            arguments: "",
            status: "running",
          },
        ],
        toolCallResults: new Map(state.toolCallResults).set(action.id, {
          status: "running",
        }),
      };

    case "TOOL_CALL_ARGS_DELTA":
      return {
        ...state,
        activeToolCalls: state.activeToolCalls.map((tc) =>
          tc.id === action.id
            ? { ...tc, arguments: tc.arguments + action.delta }
            : tc
        ),
      };

    case "TOOL_CALL_COMPLETE":
      return {
        ...state,
        activeToolCalls: state.activeToolCalls.map((tc) =>
          tc.id === action.id
            ? { ...tc, arguments: action.arguments }
            : tc
        ),
      };

    case "TOOL_RESULT":
      return {
        ...state,
        activeToolCalls: state.activeToolCalls.map((tc) =>
          tc.id === action.id
            ? {
                ...tc,
                status: "complete" as const,
                result: action.result,
                success: action.success,
              }
            : tc
        ),
        toolCallResults: new Map(state.toolCallResults).set(action.id, {
          status: "complete",
          result: action.result,
          success: action.success,
        }),
      };

    case "MESSAGE_COMPLETE": {
      // Finalize streaming content + tool calls into a message
      const assistantMsg: AssistantMessage = {
        id: action.messageId,
        conversation_id: state.conversationId || "",
        role: "assistant",
        content: state.streamingContent || null,
        tool_calls:
          state.activeToolCalls.length > 0
            ? state.activeToolCalls.map(
                (tc): AssistantToolCall => ({
                  id: tc.id,
                  type: "function",
                  function: { name: tc.name, arguments: tc.arguments },
                })
              )
            : null,
        tool_call_id: null,
        tool_name: null,
        metadata: state.streamingReasoning?.text.trim()
          ? {
              reasoning: {
                text: state.streamingReasoning.text,
                durationMs: state.streamingReasoning.durationMs,
              },
            }
          : {},
        created_at: new Date().toISOString(),
      };

      return {
        ...state,
        messages: [...state.messages, assistantMsg],
        streamingContent: "",
        streamingReasoning: null,
        activeToolCalls: [],
      };
    }

    case "ADD_USER_MESSAGE": {
      const userMsg: AssistantMessage = {
        id: crypto.randomUUID(),
        conversation_id: state.conversationId || "",
        role: "user",
        content: action.content,
        tool_calls: null,
        tool_call_id: null,
        tool_name: null,
        metadata: {
          ...(action.attachments?.length
            ? { attachments: action.attachments }
            : {}),
          ...(action.mentions?.length ? { mentions: action.mentions } : {}),
        },
        context: action.context ?? null,
        created_at: new Date().toISOString(),
      };
      return { ...state, messages: [...state.messages, userMsg] };
    }

    case "DONE":
      return {
        ...state,
        status: "idle",
        streamingContent: "",
        streamingReasoning: null,
        activeToolCalls: [],
      };

    case "GENERATING_SERVER":
      return {
        ...state,
        status: "generating_server",
        streamingContent: "",
        streamingReasoning: null,
        activeToolCalls: [],
      };

    case "ERROR":
      return {
        ...state,
        status: "error",
        error: action.message,
        streamingReasoning: state.streamingReasoning
          ? { ...state.streamingReasoning, active: false }
          : null,
      };

    case "LOAD_HISTORY":
      return {
        ...state,
        messages: action.messages,
        streamingContent: "",
        streamingReasoning: null,
        activeToolCalls: [],
        toolCallResults: buildToolCallResultsFromMessages(action.messages),
        conversationId: action.conversationId,
        conversationProjectId: action.projectId,
      };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

// ── Polling helper ────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;

/** `errorMessage` is the localized sentence surfaced to the user when the read
    fails — this helper lives outside the hook, so the caller translates it. */
async function fetchConversationStatus(
  conversationId: string,
  errorMessage: string
): Promise<{ status: ConversationStatus; error_message: string | null }> {
  const res = await fetch(
    `/api/assistant/conversations/${conversationId}/status`
  );
  if (!res.ok) throw new Error(errorMessage);
  return res.json();
}

async function fetchConversationMessages(
  conversationId: string
): Promise<AssistantMessage[]> {
  const res = await fetch(
    `/api/assistant/conversations/${conversationId}/messages`
  );
  if (!res.ok) return [];
  return res.json();
}

// ── Hook ───────────────────────────────────────────────────────────────

export interface UseAssistantChatOptions {
  /**
   * Fired for each completed tool call as its result streams in. Lets the host
   * react to side effects that live outside the chat — e.g. refreshing the
   * account when Numo edits account settings server-side. `result` is the raw
   * tool result payload.
   */
  onToolResult?: (name: string, success: boolean, result: unknown) => void;
}

export function useAssistantChat(options?: UseAssistantChatOptions) {
  const tApi = useTranslations("ApiErrors");
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep the latest callback in a ref so the SSE loop closure always calls the
  // current one without re-creating sendMessage on every render.
  const onToolResultRef = useRef(options?.onToolResult);
  onToolResultRef.current = options?.onToolResult;
  // The lively conversation, readable WITHOUT waiting for a rendering. The recovery path
  // (flow cut in flight) executes in the send closure: it read there
  // `state.conversationId`, therefore `null` for a conversation that just happened
  // just being born — the turn then started in error instead of switching to the
  // followed server side, and the thread seemed lost.
  const liveConvRef = useRef<{ id: string | null; projectId: string | null }>({
    id: null,
    projectId: null,
  });

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (conversationId: string, projectId: string | null) => {
      stopPolling();
      dispatch({ type: "GENERATING_SERVER" });

      const poll = async () => {
        try {
          const { status, error_message } = await fetchConversationStatus(
            conversationId,
            tApi("statusFetchFailed")
          );

          if (status === "idle") {
            // Generation complete - reload messages
            const messages =
              await fetchConversationMessages(conversationId);
            dispatch({
              type: "LOAD_HISTORY",
              messages,
              conversationId,
              projectId,
            });
            dispatch({ type: "DONE" });
            return;
          }

          if (status === "error") {
            // Reload messages to show any partial results
            const messages =
              await fetchConversationMessages(conversationId);
            dispatch({
              type: "LOAD_HISTORY",
              messages,
              conversationId,
              projectId,
            });
            dispatch({
              type: "ERROR",
              message: error_message || "Generation failed",
            });
            return;
          }

          // Still generating - continue polling
          pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        } catch {
          // Network error during polling - retry
          pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      };

      poll();
    },
    [stopPolling, tApi]
  );

  const sendMessage = useCallback(
    async (
      projectId: string | null,
      message: string,
      options?: {
        pageContext?: AssistantPageContext | null;
        attachments?: ResourceInput[];
        /** The “@” written in the message (members, projects). */
        mentions?: AssistantMention[];
        /** The “/” command placed at the top of the message (slash menu). */
        command?: AssistantCommandId;
      },
    ) => {
      if (!message.trim()) return;

      // Analytics (MIN-78): the message is NOT sent — only its
      // slice length, and enough to measure the real use of Numo.
      trackEvent("assistant_message_sent", {
        has_page_context: !!options?.pageContext,
        length_bucket: lengthBucket(message),
        is_first_of_conversation: !state.conversationId,
        has_project_scope: projectId !== null,
        attachment_count: options?.attachments?.length ?? 0,
        has_command: !!options?.command,
      });
      const startedAt = performance.now();
      let toolCalls = 0;

      // The shell only takes FILES: its sendings live under the prefix
      // `chat/{uid}`, outside the project, and a cat piece has no base line
      // where to put the url of a link. Composer therefore never produces any (addLink
      // refuse this prefix) — the filter is the type terminal that says so.
      const files = (options?.attachments ?? []).filter(
        (a): a is FileResourceInput => a.kind !== "link"
      );

      // Abort previous request if still running
      abortRef.current?.abort();
      stopPolling();
      const controller = new AbortController();
      abortRef.current = controller;

      dispatch({
        type: "ADD_USER_MESSAGE",
        content: message,
        context: options?.pageContext ?? null,
        attachments: options?.attachments,
        mentions: options?.mentions,
      });
      dispatch({ type: "START_STREAMING" });

      try {
        const body: AssistantChatRequest = {
          ...(projectId ? { projectId } : {}),
          message,
          conversationId: state.conversationId || undefined,
          ...(options?.pageContext ? { pageContext: options.pageContext } : {}),
          ...(files.length ? { attachments: files } : {}),
          ...(options?.mentions?.length ? { mentions: options.mentions } : {}),
          ...(options?.command ? { command: options.command } : {}),
          // The browser's time zone travels with each message: Numo has it
          // need to set a routine at the time we tell him (MIN-185).
          ...(browserTimezone() ? { timezone: browserTimezone() } : {}),
        };

        const response = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          dispatch({
            type: "ERROR",
            message:
              (errorData as { error?: string }).error ||
              `HTTP ${response.status}`,
          });
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          dispatch({ type: "ERROR", message: "No response body" });
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let eventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ") && eventType) {
              try {
                const data = JSON.parse(line.slice(6));
                if (eventType === "tool_call_start") toolCalls += 1;
                handleSSEEvent(eventType, data, dispatch, {
                  projectId: projectId ?? null,
                  onConversationId: (id) => {
                    liveConvRef.current = {
                      id,
                      projectId: projectId ?? null,
                    };
                  },
                  onToolResult: onToolResultRef.current,
                });
              } catch {
                // Skip malformed data
              }
              eventType = "";
            }
          }
        }

        // The flow has gone to the end: it is the only reliable measurement of the time of
        // response from Numo and its real use of tools.
        trackEvent("assistant_response_received", {
          had_tool_calls: toolCalls > 0,
          tool_count: toolCalls,
          duration_bucket: durationBucket(performance.now() - startedAt),
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        // Connection lost - check if server is still processing. The ref, not
        // `state`: a conversation born during THIS sending does not yet exist
        // in the closure, and this is precisely the one we would lose.
        const convId = liveConvRef.current.id ?? state.conversationId;
        const convProjectId = liveConvRef.current.id
          ? liveConvRef.current.projectId
          : (projectId ?? null);
        if (convId) {
          try {
            const { status } = await fetchConversationStatus(
              convId,
              tApi("statusFetchFailed")
            );
            if (status === "generating") {
              startPolling(convId, convProjectId);
              return;
            }
            if (status === "idle") {
              // Server already finished - reload messages
              const messages = await fetchConversationMessages(convId);
              dispatch({
                type: "LOAD_HISTORY",
                messages,
                conversationId: convId,
                projectId: convProjectId,
              });
              dispatch({ type: "DONE" });
              return;
            }
          } catch {
            // Can't reach server - show error
          }
        }

        trackEvent("assistant_response_failed", { reason: errorReason(err) });
        dispatch({
          type: "ERROR",
          message: (err as Error).message || "Connection failed",
        });
      }
    },
    [state.conversationId, startPolling, stopPolling, tApi]
  );

  /** `projectId` = the scope of THIS conversation, as it is in base.
 * The caller always knows it (the history list carries it, like the
 * open conversation pointer): it is this which sets the scope to the
 * resume, instead of the project of the current URL (MIN-353). */
  const loadConversation = useCallback(
    async (conversationId: string, projectId: string | null) => {
      stopPolling();
      // Cancel any in-flight send so its later SSE chunks don't dispatch on
      // top of the conversation we are about to load.
      abortRef.current?.abort();
      liveConvRef.current = { id: conversationId, projectId };
      trackEvent("assistant_conversation_loaded", {});
      try {
        const messages = await fetchConversationMessages(conversationId);
        dispatch({
          type: "LOAD_HISTORY",
          messages,
          conversationId,
          projectId,
        });

        // Check if server is still generating for this conversation
        const { status, error_message } = await fetchConversationStatus(
          conversationId,
          tApi("statusFetchFailed")
        );
        if (status === "generating") {
          startPolling(conversationId, projectId);
        } else if (status === "error") {
          dispatch({
            type: "ERROR",
            message: error_message || "Generation failed",
          });
        }
      } catch (err) {
        console.error("[assistant] loadConversation failed", err);
        dispatch({
          type: "ERROR",
          message: (err as Error)?.message ?? tApi("conversationLoadFailed"),
        });
      }
    },
    [startPolling, stopPolling, tApi]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    stopPolling();
    liveConvRef.current = { id: null, projectId: null };
    trackEvent("assistant_conversation_new", {});
    dispatch({ type: "RESET" });
  }, [stopPolling]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    stopPolling();
    trackEvent("assistant_stopped", {});
    dispatch({ type: "DONE" });
  }, [stopPolling]);

  return {
    state,
    sendMessage,
    loadConversation,
    reset,
    abort,
  };
}

// ── SSE event dispatcher ───────────────────────────────────────────────

interface SSEContext {
  /** The scope of the current send — the scope of the created conversation. */
  projectId: string | null;
  onConversationId?: (conversationId: string) => void;
  onToolResult?: (name: string, success: boolean, result: unknown) => void;
}

function handleSSEEvent(
  eventType: string,
  data: Record<string, unknown>,
  dispatch: React.Dispatch<Action>,
  ctx: SSEContext
) {
  const { projectId, onConversationId, onToolResult } = ctx;
  switch (eventType) {
    case "conversation_id":
      dispatch({
        type: "SET_CONVERSATION_ID",
        conversationId: data.conversationId as string,
        projectId,
      });
      onConversationId?.(data.conversationId as string);
      break;
    case "content_delta":
      dispatch({ type: "CONTENT_DELTA", delta: data.delta as string });
      break;
    case "reasoning_start":
      dispatch({ type: "REASONING_START" });
      break;
    case "reasoning_tick":
      dispatch({
        type: "REASONING_TICK",
        durationMs: data.duration_ms as number,
      });
      break;
    case "reasoning_end":
      dispatch({
        type: "REASONING_END",
        durationMs: data.duration_ms as number,
        text: data.text as string,
      });
      break;
    case "tool_call_start":
      dispatch({
        type: "TOOL_CALL_START",
        id: data.id as string,
        name: data.name as string,
      });
      break;
    case "tool_call_args_delta":
      dispatch({
        type: "TOOL_CALL_ARGS_DELTA",
        id: data.id as string,
        delta: data.delta as string,
      });
      break;
    case "tool_call_complete":
      dispatch({
        type: "TOOL_CALL_COMPLETE",
        id: data.id as string,
        name: data.name as string,
        arguments: data.arguments as string,
      });
      break;
    case "tool_result":
      dispatch({
        type: "TOOL_RESULT",
        id: data.id as string,
        name: data.name as string,
        result: data.result,
        success: data.success as boolean,
      });
      onToolResult?.(
        data.name as string,
        data.success as boolean,
        data.result
      );
      break;
    case "message_complete":
      dispatch({
        type: "MESSAGE_COMPLETE",
        messageId: data.message_id as string,
      });
      break;
    case "done":
      dispatch({ type: "DONE" });
      break;
    case "error":
      dispatch({ type: "ERROR", message: data.message as string });
      break;
  }
}
