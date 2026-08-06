"use client";

import { useCallback, useReducer, useRef } from "react";
import { useTranslations } from "next-intl";
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
    // Un résultat trop gros pour le modèle voyage sur la métadonnée : `content`
    // ne porte alors que le résumé qu'il relit, et l'écran a besoin du tout (la
    // proposition d'amorce et ses quarante titres, MIN-173).
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
  activeToolCalls: ActiveToolCall[];
  toolCallResults: Map<string, ToolCallResult>;
  conversationId: string | null;
  error: string | null;
}

const initialState: AssistantChatState = {
  status: "idle",
  messages: [],
  streamingContent: "",
  activeToolCalls: [],
  toolCallResults: new Map(),
  conversationId: null,
  error: null,
};

// ── Actions ────────────────────────────────────────────────────────────

type Action =
  | { type: "START_STREAMING" }
  | { type: "SET_CONVERSATION_ID"; conversationId: string }
  | { type: "CONTENT_DELTA"; delta: string }
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
        activeToolCalls: [],
        error: null,
      };

    case "SET_CONVERSATION_ID":
      return { ...state, conversationId: action.conversationId };

    case "CONTENT_DELTA":
      return {
        ...state,
        status: "streaming",
        streamingContent: state.streamingContent + action.delta,
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
        metadata: {},
        created_at: new Date().toISOString(),
      };

      return {
        ...state,
        messages: [...state.messages, assistantMsg],
        streamingContent: "",
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
        activeToolCalls: [],
      };

    case "GENERATING_SERVER":
      return {
        ...state,
        status: "generating_server",
        streamingContent: "",
        activeToolCalls: [],
      };

    case "ERROR":
      return { ...state, status: "error", error: action.message };

    case "LOAD_HISTORY":
      return {
        ...state,
        messages: action.messages,
        toolCallResults: buildToolCallResultsFromMessages(action.messages),
        conversationId: action.conversationId,
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

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (conversationId: string) => {
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
        /** Les « @ » écrits dans le message (membres, projets). */
        mentions?: AssistantMention[];
        /** La commande « / » posée en tête du message (menu slash). */
        command?: AssistantCommandId;
      },
    ) => {
      if (!message.trim()) return;

      // Analytics (MIN-78) : le message N'EST PAS envoyé — seulement sa
      // longueur en tranche, et de quoi mesurer l'usage réel de Numo.
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

      // Le shell ne prend que des FICHIERS : ses envois vivent sous le préfixe
      // `chat/{uid}`, hors projet, et une pièce du chat n'a pas de ligne en base
      // où poser l'url d'un lien. Le composer n'en produit donc jamais (addLink
      // refuse ce préfixe) — le filtre est la borne de type qui le dit.
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
                handleSSEEvent(eventType, data, dispatch, onToolResultRef.current);
              } catch {
                // Skip malformed data
              }
              eventType = "";
            }
          }
        }

        // Le flux est allé au bout : c'est la seule mesure fiable du temps de
        // réponse de Numo et de son recours réel aux outils.
        trackEvent("assistant_response_received", {
          had_tool_calls: toolCalls > 0,
          tool_count: toolCalls,
          duration_bucket: durationBucket(performance.now() - startedAt),
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        // Connection lost - check if server is still processing
        const convId = state.conversationId;
        if (convId) {
          try {
            const { status } = await fetchConversationStatus(
              convId,
              tApi("statusFetchFailed")
            );
            if (status === "generating") {
              startPolling(convId);
              return;
            }
            if (status === "idle") {
              // Server already finished - reload messages
              const messages = await fetchConversationMessages(convId);
              dispatch({
                type: "LOAD_HISTORY",
                messages,
                conversationId: convId,
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

  const loadConversation = useCallback(
    async (conversationId: string) => {
      stopPolling();
      // Cancel any in-flight send so its later SSE chunks don't dispatch on
      // top of the conversation we are about to load.
      abortRef.current?.abort();
      trackEvent("assistant_conversation_loaded", {});
      try {
        const messages = await fetchConversationMessages(conversationId);
        dispatch({
          type: "LOAD_HISTORY",
          messages,
          conversationId,
        });

        // Check if server is still generating for this conversation
        const { status, error_message } = await fetchConversationStatus(
          conversationId,
          tApi("statusFetchFailed")
        );
        if (status === "generating") {
          startPolling(conversationId);
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

function handleSSEEvent(
  eventType: string,
  data: Record<string, unknown>,
  dispatch: React.Dispatch<Action>,
  onToolResult?: (name: string, success: boolean, result: unknown) => void
) {
  switch (eventType) {
    case "conversation_id":
      dispatch({
        type: "SET_CONVERSATION_ID",
        conversationId: data.conversationId as string,
      });
      break;
    case "content_delta":
      dispatch({ type: "CONTENT_DELTA", delta: data.delta as string });
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
