"use client";

import { createUuid } from "@/lib/create-uuid";

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
  AssistantSkillSelection,
  ConversationStatus,
  NumoTurnActivity,
  NumoTurnStatus,
  NumoConversationDetail,
} from "./assistant-types";
import { fetchNumoConversation, updateConversationWithResult } from "./assistant-api";
import { createSerialQueue } from "./serial-queue";
import { isReasoningLevel, type ReasoningLevel } from "./agent-reasoning";
import type { FileResourceInput, ResourceInput } from "./types";
import { trackEvent } from "./analytics";
import { durationBucket, errorReason, lengthBucket } from "./analytics-sanitize";
import type { AssistantReasoning } from "./assistant-reasoning";
import { createAssistantEventStream } from "./assistant-event-stream";

const ACTIVE_NUMO_TURN_STATUSES = new Set([
  "queued", "running", "waiting_work", "waiting_input", "stopping", "retryable", "reconciling",
]);

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
  /** Legacy project metadata retained when loading older conversations. */
  conversationProjectId: string | null;
  /** Explicit model override; null follows the active assistant default. */
  conversationModel: string | null;
  /** Explicit reasoning override; null follows the compatible legacy default. */
  conversationReasoningLevel: ReasoningLevel | null;
  /** Last validation or persistence failure for the conversation settings. */
  conversationConfigError: string | null;
  error: string | null;
  turnStatus: NumoTurnStatus | null;
  /** Undefined until checked; null once the server confirms no worker decision is pending. */
  pendingWorkerInput: AssistantChatRequest["workerInput"] | null | undefined;
  /** Provenance for conversations created by a routine occurrence. */
  routineOccurrence: NonNullable<NumoConversationDetail["routine_occurrence"]> | null;
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
  conversationModel: null,
  conversationReasoningLevel: null,
  conversationConfigError: null,
  error: null,
  turnStatus: null,
  pendingWorkerInput: undefined,
  routineOccurrence: null,
};

// ── Actions ────────────────────────────────────────────────────────────

type Action =
  | { type: "START_STREAMING" }
  | {
      type: "SET_CONVERSATION_ID";
      conversationId: string;
      projectId: string | null;
    }
  | {
      type: "SET_CONVERSATION_CONFIG";
      model: string | null;
      reasoningLevel: ReasoningLevel | null;
      error?: string | null;
    }
  | { type: "CONTENT_DELTA"; delta: string }
  | { type: "REASONING_START" }
  | { type: "REASONING_TICK"; durationMs: number }
  | { type: "REASONING_DELTA"; text: string }
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
      skills?: AssistantSkillSelection[];
    }
  | { type: "DONE" }
  | { type: "GENERATING_SERVER" }
  | {
      type: "SET_PENDING_WORKER_INPUT";
      workerInput: AssistantChatRequest["workerInput"] | null;
    }
  | { type: "ERROR"; message: string; turnStatus?: NumoTurnStatus }
  | { type: "STOP_FAILED"; message: string }
  | {
      type: "LOAD_HISTORY";
      messages: AssistantMessage[];
      conversationId: string;
      projectId: string | null;
      model?: string | null;
      reasoningLevel?: ReasoningLevel | null;
      routineOccurrence?: NonNullable<NumoConversationDetail["routine_occurrence"]> | null;
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
        turnStatus: null,
      };

    case "SET_CONVERSATION_ID":
      return {
        ...state,
        conversationId: action.conversationId,
        conversationProjectId: action.projectId,
      };

    case "SET_CONVERSATION_CONFIG":
      return {
        ...state,
        conversationModel: action.model,
        conversationReasoningLevel: action.reasoningLevel,
        conversationConfigError: action.error ?? null,
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

    case "REASONING_DELTA":
      // A snapshot of the trace so far, not an increment: replace, never
      // append. Guarded on the active reflection so a delta replayed from the
      // journal cannot overwrite a finished trace.
      if (!state.streamingReasoning?.active) return state;
      return {
        ...state,
        streamingReasoning: { ...state.streamingReasoning, text: action.text },
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
      if (state.messages.some((message) => message.id === action.messageId)) {
        return {
          ...state,
          streamingContent: "",
          streamingReasoning: null,
          activeToolCalls: [],
        };
      }
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
        id: createUuid(),
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
          ...(action.skills?.length ? { skills: action.skills } : {}),
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
        turnStatus: null,
      };

    case "GENERATING_SERVER":
      return {
        ...state,
        status: "generating_server",
        streamingContent: "",
        streamingReasoning: null,
        activeToolCalls: [],
        error: null,
      };

    case "SET_PENDING_WORKER_INPUT":
      return { ...state, pendingWorkerInput: action.workerInput };

    case "ERROR":
      return {
        ...state,
        status: "error",
        error: action.message,
        turnStatus: action.turnStatus ?? state.turnStatus,
        streamingReasoning: state.streamingReasoning
          ? { ...state.streamingReasoning, active: false }
          : null,
      };

    case "STOP_FAILED":
      return { ...state, status: "generating_server", error: action.message };

    case "LOAD_HISTORY":
      return {
        ...state,
        status: "idle",
        messages: action.messages,
        streamingContent: "",
        streamingReasoning: null,
        activeToolCalls: [],
        toolCallResults: buildToolCallResultsFromMessages(action.messages),
        conversationId: action.conversationId,
        conversationProjectId: action.projectId,
        ...(action.model !== undefined ? { conversationModel: action.model } : {}),
        ...(action.reasoningLevel !== undefined
          ? { conversationReasoningLevel: action.reasoningLevel }
          : {}),
        ...(action.routineOccurrence !== undefined
          ? { routineOccurrence: action.routineOccurrence }
          : {}),
        conversationConfigError: null,
        error: null,
        turnStatus: null,
      };

    case "RESET":
      // A new conversation keeps the conversation-level config the user chose:
      // the DEFAULT model is what follows the assistant default (null here),
      // the CHOSEN model (a picked id) travels across conversations.
      return {
        ...initialState,
        conversationModel: state.conversationModel,
        conversationReasoningLevel: state.conversationReasoningLevel,
      };

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
  errorMessage: string,
  after = -1,
): Promise<{
  status: ConversationStatus | NumoTurnStatus;
  error_message: string | null;
  turn_id?: string | null;
  last_event_seq?: number;
  active_run_id?: string | null;
  pending_input?: {
    run_id: string;
    parent_numo_turn_id: string;
    question_id: string;
    call_id: string;
    questions: unknown[];
    created_at: string;
  } | null;
  activity?: NumoTurnActivity[];
}> {
  const res = await fetch(
    `/api/assistant/conversations/${conversationId}/status?after=${after}`
  );
  if (!res.ok) throw new Error(errorMessage);
  return res.json();
}

function pendingWorkerInput(
  value: Awaited<ReturnType<typeof fetchConversationStatus>>["pending_input"],
): AssistantChatRequest["workerInput"] | null {
  if (!value) return null;
  return {
    parentTurnId: value.parent_numo_turn_id,
    runId: value.run_id,
    questionId: value.question_id,
  };
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
  const activeSendRef = useRef<{
    requestId: string;
    conversationId: string;
    newConversation: boolean;
    projectId: string | null;
    frozen: boolean;
    turnId?: string;
  } | null>(null);
  const activeTurnRef = useRef<{ conversationId: string; turnId: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollGenerationRef = useRef(0);
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
  const configRef = useRef<{
    model: string | null;
    reasoningLevel: ReasoningLevel | null;
  }>({ model: null, reasoningLevel: null });
  const configWritesRef = useRef(createSerialQueue());
  const confirmedConfigsRef = useRef(new Map<string, {
    model: string | null;
    reasoningLevel: ReasoningLevel | null;
  }>());
  const loadGenerationRef = useRef(0);
  const configRevisionRef = useRef(0);

  const stopPolling = useCallback(() => {
    // Clearing a timeout cannot cancel a status request already in flight.
    // Retire that poll before it can replay text or revive a stopped composer.
    pollGenerationRef.current += 1;
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (
      conversationId: string,
      projectId: string | null,
      options?: { quiet?: boolean },
    ) => {
      stopPolling();
      const pollGeneration = pollGenerationRef.current;
      const isCurrentPoll = () => pollGenerationRef.current === pollGeneration;
      // A quiet poll (right after a stop) does not present the conversation
      // as busy: the optimistic idle pasted by the stop must not be undone
      // unless the authoritative status says the turn is still working.
      if (!options?.quiet) dispatch({ type: "GENERATING_SERVER" });
      let after = -1;
      // Suspension already reflected in the thread: `<turn>:<run>` last reloaded.
      let reloadedSuspension: string | null = null;
      // The turn is suspended on its delegated worker — the assistant itself
      // is paused until the worker wakes it.
      let suspended = false;
      // The turn died (claim ceiling reached) and waits for the drain to re-run
      // it from its checkpoint — history reloaded once on entering that wait.
      let reloadedRetryable = false;

      const reloadMessages = async () => {
        const messages = await fetchConversationMessages(conversationId);
        if (!isCurrentPoll()) return;
        dispatch({
          type: "LOAD_HISTORY",
          messages,
          conversationId,
          projectId,
        });
      };

      const poll = async () => {
        try {
          const response = await fetchConversationStatus(
            conversationId,
            tApi("statusFetchFailed"),
            after,
          );
          if (!isCurrentPoll()) return;
          const { status, error_message } = response;
          activeTurnRef.current = response.turn_id && ACTIVE_NUMO_TURN_STATUSES.has(status)
            ? { conversationId, turnId: response.turn_id } : null;
          dispatch({
            type: "SET_PENDING_WORKER_INPUT",
            workerInput: pendingWorkerInput(response.pending_input),
          });
          for (const event of response.activity ?? []) {
            if (!options?.quiet) {
              handleSSEEvent(event.type, event.payload, dispatch, {
                projectId,
                onToolResult: onToolResultRef.current,
              });
            }
            after = Math.max(after, event.seq);
          }

          if (status === "waiting_work") {
            // The turn is suspended while its delegated worker runs in the
            // sandbox. The card's live state comes from polling the run, and
            // it needs the run id carried by the persisted launch tool
            // result — which a replayed journal never re-emits (`tool_result`
            // is not persisted). Reload the history once per suspension so
            // the card picks the real state instead of staying on
            // "Starting" until the worker ends.
            const key = `${response.turn_id}:${response.active_run_id ?? ""}`;
            if (key !== reloadedSuspension) {
              await reloadMessages();
              if (!isCurrentPoll()) return;
              // Set only after success: a failed reload must be retried by
              // the next poll instead of being skipped forever.
              reloadedSuspension = key;
              // The assistant handed the work to its agent: it is not
              // "Traitement en cours…" for minutes. The composer goes back
              // to idle; the delegated card carries the live state, and the
              // wake-up re-arms the generating presentation below.
              dispatch({ type: "DONE" });
            }
            suspended = true;
            pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
            return;
          }

          if (
            suspended
            && (status === "queued" || status === "running" || status === "stopping")
          ) {
            // The worker finished and the parent turn woke up: back to the
            // generating presentation so the resumed replay is visible.
            suspended = false;
            dispatch({ type: "GENERATING_SERVER" });
          }

          if (status === "stopping" && options?.quiet) {
            // The stop is recorded but the durable turn has not landed yet:
            // keep the optimistic idle and re-check sooner than the regular
            // cadence so the thread settles as fast as the server does.
            pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
            return;
          }

          if (status === "idle" || status === "completed" || status === "waiting_input" || status === "stopped") {
            // Generation complete - reload messages
            const messages =
              await fetchConversationMessages(conversationId);
            if (!isCurrentPoll()) return;
            dispatch({
              type: "LOAD_HISTORY",
              messages,
              conversationId,
              projectId,
            });
            dispatch({ type: "DONE" });
            return;
          }

          if (status === "retryable") {
            // NOT a terminal state: the drain re-queues the turn from its
            // checkpoint within about a minute (stale-claim recovery), so the
            // thread must keep polling instead of freezing on an error card
            // the user would have to dismiss. The resumed round continues on
            // the same event journal.
            if (!reloadedRetryable) {
              await reloadMessages();
              if (!isCurrentPoll()) return;
              // Same rule as the suspension reload: a failed reload is
              // retried by the next poll instead of being skipped forever.
              reloadedRetryable = true;
            }
            pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
            return;
          }

          if (status === "error" || status === "failed" || status === "reconciling") {
            // Reload messages to show any partial results
            const messages =
              await fetchConversationMessages(conversationId);
            if (!isCurrentPoll()) return;
            dispatch({
              type: "LOAD_HISTORY",
              messages,
              conversationId,
              projectId,
            });
            dispatch({
              type: "ERROR",
              message: error_message || (status === "reconciling"
                ? "A tool result needs reconciliation before this turn can continue."
                : "Generation failed"),
              turnStatus: status as NumoTurnStatus,
            });
            return;
          }

          // Still generating - continue polling. A quiet poll that finds the
          // turn alive (stop refused or another writer re-queued it) restores
          // the busy presentation, then follows the regular cadence.
          if (options?.quiet) dispatch({ type: "GENERATING_SERVER" });
          pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        } catch {
          // Network error during polling - retry
          if (isCurrentPoll()) pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      };

      poll();
    },
    [stopPolling, tApi]
  );

  /**
   * The stream died without its terminal `done`/`error` (reload, network cut,
   * serverless eviction) or the read failed: the durable turn lives on
   * server-side — running, or waiting for the drain — and the authoritative
   * status tells which. Shared by both connection-loss paths: without it, a
   * stream that closed cleanly but early froze the conversation with no poll
   * and no error until a manual reload.
   */
  const reconcileAfterConnectionLost = useCallback(async (
    signal: AbortSignal,
    isCurrent: () => boolean,
  ): Promise<boolean> => {
    if (signal.aborted || !isCurrent()) return true;
    const convId = liveConvRef.current.id ?? state.conversationId;
    const convProjectId = liveConvRef.current.id
      ? liveConvRef.current.projectId
      : state.conversationProjectId;
    if (!convId) return false;
    try {
      const { status, error_message, turn_id } = await fetchConversationStatus(
        convId,
        tApi("statusFetchFailed")
      );
      if (signal.aborted || !isCurrent()) return true;
      activeTurnRef.current = turn_id && ACTIVE_NUMO_TURN_STATUSES.has(status)
        ? { conversationId: convId, turnId: turn_id } : null;
      if (status === "generating" || status === "queued" || status === "running" || status === "waiting_work" || status === "stopping" || status === "retryable") {
        startPolling(convId, convProjectId);
        return true;
      }
      if (status === "idle" || status === "completed" || status === "waiting_input" || status === "stopped") {
        // Server already finished - reload messages
        const messages = await fetchConversationMessages(convId);
        if (signal.aborted || !isCurrent()) return true;
        dispatch({
          type: "LOAD_HISTORY",
          messages,
          conversationId: convId,
          projectId: convProjectId,
        });
        dispatch({ type: "DONE" });
        return true;
      }
      if (status === "error" || status === "failed" || status === "reconciling") {
        // Reload messages to show any partial results
        const messages = await fetchConversationMessages(convId);
        if (signal.aborted || !isCurrent()) return true;
        dispatch({
          type: "LOAD_HISTORY",
          messages,
          conversationId: convId,
          projectId: convProjectId,
        });
        dispatch({
          type: "ERROR",
          message: error_message || "Generation failed",
          ...(status === "error" ? {} : { turnStatus: status }),
        });
        return true;
      }
    } catch {
      // Can't reach server - the caller shows the connection error
    }
    return signal.aborted || !isCurrent();
  }, [state.conversationId, state.conversationProjectId, startPolling, tApi]);

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
        /** Repository skills explicitly attached to this message. */
        skills?: AssistantSkillSelection[];
        workerInput?: AssistantChatRequest["workerInput"];
        /** Voluntary entry provenance from the common Numo intent contract. */
        intent?: AssistantChatRequest["intent"];
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
        skill_count: options?.skills?.length ?? 0,
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
      if (!activeSendRef.current?.frozen) abortRef.current?.abort();
      stopPolling();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestConversationId = liveConvRef.current.id ?? state.conversationId;
      const sending = {
        requestId: createUuid(),
        conversationId: requestConversationId ?? createUuid(),
        newConversation: !requestConversationId,
        projectId,
        frozen: false,
        turnId: options?.workerInput?.parentTurnId
          ?? (activeTurnRef.current?.conversationId === requestConversationId
            ? activeTurnRef.current.turnId : undefined),
      };
      activeSendRef.current = sending;

      dispatch({
        type: "ADD_USER_MESSAGE",
        content: message,
        context: options?.pageContext ?? null,
        attachments: options?.attachments,
        mentions: options?.mentions,
        skills: options?.skills,
      });
      dispatch({ type: "START_STREAMING" });

      try {
        const body: AssistantChatRequest = {
          requestId: sending.requestId,
          ...(projectId ? { projectId } : {}),
          message,
          conversationId: requestConversationId || undefined,
          ...(!requestConversationId ? { newConversationId: sending.conversationId } : {}),
          model: configRef.current.model,
          reasoningLevel: configRef.current.reasoningLevel,
          ...(options?.pageContext ? { pageContext: options.pageContext } : {}),
          ...(files.length ? { attachments: files } : {}),
          ...(options?.mentions?.length ? { mentions: options.mentions } : {}),
          ...(options?.command ? { command: options.command } : {}),
          ...(options?.skills?.length
            ? { skills: options.skills }
            : {}),
          ...(options?.workerInput ? { workerInput: options.workerInput } : {}),
          ...(options?.intent ? { intent: options.intent } : {}),
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
        if (controller.signal.aborted) return;

        if (!response.ok) {
          if (sending.frozen || activeSendRef.current !== sending) return;
          const errorData = await response.json().catch(() => ({}));
          dispatch({
            type: "ERROR",
            message:
              (errorData as { error?: string }).error ||
              `HTTP ${response.status}`,
          });
          return;
        }

        const responseConversationId = response.headers.get("X-Numo-Conversation-Id");
        const responseTurnId = response.headers.get("X-Numo-Turn-Id");
        if (responseTurnId) sending.turnId = responseTurnId;
        if (responseConversationId && activeSendRef.current === sending) {
          if (responseTurnId) activeTurnRef.current = { conversationId: responseConversationId, turnId: responseTurnId };
          liveConvRef.current = { id: responseConversationId, projectId };
          if (!requestConversationId) {
            confirmedConfigsRef.current.set(responseConversationId, {
              ...configRef.current,
            });
          }
          dispatch({
            type: "SET_CONVERSATION_ID",
            conversationId: responseConversationId,
            projectId,
          });
        }

        const reader = response.body?.getReader();
        if (!reader) {
          dispatch({ type: "ERROR", message: "No response body" });
          return;
        }

        let finalServerStatus: ConversationStatus | NumoTurnStatus | null = null;
        const eventStream = createAssistantEventStream((eventType, data) => {
          if (controller.signal.aborted) return;
          if (eventType === "tool_call_start") toolCalls += 1;
          if ((eventType === "done" || eventType === "error") && typeof data.status === "string") {
            finalServerStatus = data.status as ConversationStatus | NumoTurnStatus;
            if (activeSendRef.current === sending && !ACTIVE_NUMO_TURN_STATUSES.has(data.status)) {
              activeTurnRef.current = null;
            }
          }
          // Keep the connection alive until the executor acknowledges its stop.
          // Vercel may freeze a disconnected request before its next stop poll.
          if (sending.frozen || activeSendRef.current !== sending) return;
          handleSSEEvent(eventType, data, dispatch, {
            projectId: state.conversationProjectId,
            onConversationId: (id, turnId) => {
              if (turnId) {
                sending.turnId = turnId;
                activeTurnRef.current = { conversationId: id, turnId };
              }
              liveConvRef.current = {
                id,
                projectId: liveConvRef.current.id === id ? liveConvRef.current.projectId : null,
              };
            },
            onToolResult: onToolResultRef.current,
          });
        });

        while (true) {
          const { done, value } = await reader.read();
          if (controller.signal.aborted) return;
          if (done) break;

          eventStream.push(value);
        }
        eventStream.finish();
        if (sending.frozen || activeSendRef.current !== sending) return;

        // A stream that closed WITHOUT its terminal `done`/`error` (clean close
        // on a proxy timeout, function eviction) previously left the reducer on
        // `streaming` forever — the frozen conversation this hook exists to
        // avoid. Reconcile from the authoritative status instead.
        if (finalServerStatus === null) {
          const reconciled = await reconcileAfterConnectionLost(
            controller.signal, () => !sending.frozen && activeSendRef.current === sending,
          );
          if (!reconciled) {
            dispatch({ type: "ERROR", message: "Connection failed" });
          }
          return;
        }

        // A retryable terminal event (first in-request failure) is NOT an
        // end either: the drain re-queues the turn from its checkpoint and
        // the poll rides it out, as the poll loop's own retryable branch does.
        if (finalServerStatus === "waiting_work" || finalServerStatus === "queued"
          || finalServerStatus === "running" || finalServerStatus === "stopping"
          || finalServerStatus === "retryable") {
          const conversationId = liveConvRef.current.id ?? state.conversationId;
          if (conversationId) {
            startPolling(conversationId, liveConvRef.current.projectId);
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
        if (sending.frozen || activeSendRef.current !== sending) return;
        if ((err as Error).name === "AbortError") return;

        // Connection lost - check if server is still processing. The ref, not
        // `state`: a conversation born during THIS sending does not yet exist
        // in the closure, and this is precisely the one we would lose.
        const reconciled = await reconcileAfterConnectionLost(
          controller.signal, () => !sending.frozen && activeSendRef.current === sending,
        );
        if (reconciled) return;

        trackEvent("assistant_response_failed", { reason: errorReason(err) });
        dispatch({
          type: "ERROR",
          message: (err as Error).message || "Connection failed",
        });
      }
    },
    [state.conversationId, startPolling, stopPolling, tApi]
  );

  /** Load a conversation by identity; project metadata never chooses the next target. */
  const loadConversation = useCallback(
    async (conversationId: string, projectId: string | null) => {
      const loadGeneration = ++loadGenerationRef.current;
      const configRevision = configRevisionRef.current;
      stopPolling();
      // Cancel any in-flight send so its later SSE chunks don't dispatch on
      // top of the conversation we are about to load.
      if (!activeSendRef.current?.frozen) abortRef.current?.abort();
      activeSendRef.current = null;
      activeTurnRef.current = null;
      liveConvRef.current = { id: conversationId, projectId };
      trackEvent("assistant_conversation_loaded", {});
      try {
        const detail = await fetchNumoConversation(conversationId);
        if (loadGeneration !== loadGenerationRef.current) return;
        const conversationProjectId = detail.conversation.project_id ?? projectId;
        liveConvRef.current = { id: conversationId, projectId: conversationProjectId };
        const messages = [...detail.messages, ...detail.actions]
          .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
        const model = detail.conversation.model ?? null;
        const reasoningLevel = isReasoningLevel(detail.conversation.reasoning_level)
          ? detail.conversation.reasoning_level
          : null;
        const serverConfig = { model, reasoningLevel };
        const configChangedWhileLoading = configRevision !== configRevisionRef.current;
        if (!configChangedWhileLoading || !confirmedConfigsRef.current.has(conversationId)) {
          confirmedConfigsRef.current.set(conversationId, serverConfig);
        }
        if (!configChangedWhileLoading) {
          configRef.current = serverConfig;
          dispatch({
            type: "LOAD_HISTORY",
            messages,
            conversationId,
            projectId: conversationProjectId,
            model,
            reasoningLevel,
            routineOccurrence: detail.routine_occurrence ?? null,
          });
        } else {
          dispatch({
            type: "LOAD_HISTORY",
            messages,
            conversationId,
            projectId: conversationProjectId,
            routineOccurrence: detail.routine_occurrence ?? null,
          });
        }

        // Check if server is still generating for this conversation
        const response = await fetchConversationStatus(
          conversationId,
          tApi("statusFetchFailed")
        );
        const { status, error_message } = response;
        if (loadGeneration !== loadGenerationRef.current) return;
        activeTurnRef.current = response.turn_id && ACTIVE_NUMO_TURN_STATUSES.has(status)
          ? { conversationId, turnId: response.turn_id } : null;
        dispatch({
          type: "SET_PENDING_WORKER_INPUT",
          workerInput: pendingWorkerInput(response.pending_input),
        });
        if (status === "generating" || status === "queued" || status === "running" || status === "waiting_work" || status === "stopping" || status === "retryable") {
          startPolling(conversationId, conversationProjectId);
        } else if (status === "error" || status === "failed" || status === "reconciling") {
          dispatch({
            type: "ERROR",
            message: error_message || "Generation failed",
            turnStatus: status as NumoTurnStatus,
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

  const updateConversationConfig = useCallback(
    async (patch: {
      model?: string | null;
      reasoningLevel?: ReasoningLevel | null;
    }): Promise<boolean> => {
      const previous = configRef.current;
      const next = {
        model: patch.model === undefined ? previous.model : patch.model,
        reasoningLevel:
          patch.reasoningLevel === undefined
            ? previous.reasoningLevel
            : patch.reasoningLevel,
      };
      configRef.current = next;
      const configRevision = ++configRevisionRef.current;
      dispatch({ type: "SET_CONVERSATION_CONFIG", ...next });

      const conversationId = liveConvRef.current.id ?? state.conversationId;
      if (!conversationId) return true;

      const resultRef: {
        current: Awaited<ReturnType<typeof updateConversationWithResult>> | undefined;
      } = { current: undefined };
      await configWritesRef.current(async () => {
        resultRef.current = await updateConversationWithResult(conversationId, {
          model: next.model,
          reasoningLevel: next.reasoningLevel,
        });
      });
      const result = resultRef.current;
      if (result?.ok) {
        confirmedConfigsRef.current.set(conversationId, next);
        if (
          configRevision === configRevisionRef.current &&
          liveConvRef.current.id === conversationId &&
          configRef.current.model === next.model &&
          configRef.current.reasoningLevel === next.reasoningLevel
        ) {
          dispatch({ type: "SET_CONVERSATION_CONFIG", ...next });
        }
        return true;
      }

      // A later change may already have superseded this failed write. Only
      // roll back when the visible state still represents the failed request.
      if (
        configRevision === configRevisionRef.current &&
        liveConvRef.current.id === conversationId &&
        configRef.current.model === next.model &&
        configRef.current.reasoningLevel === next.reasoningLevel
      ) {
        const confirmed = confirmedConfigsRef.current.get(conversationId) ?? previous;
        configRef.current = confirmed;
        dispatch({
          type: "SET_CONVERSATION_CONFIG",
          ...confirmed,
          error: result?.error ?? "Unable to save conversation settings",
        });
      }
      return false;
    },
    [state.conversationId]
  );

  const reset = useCallback(() => {
    if (!activeSendRef.current?.frozen) abortRef.current?.abort();
    activeSendRef.current = null;
    activeTurnRef.current = null;
    stopPolling();
    loadGenerationRef.current += 1;
    liveConvRef.current = { id: null, projectId: null };
    configRevisionRef.current += 1;
    // Keep the chosen config — null means "follow the default", a picked id
    // carries over to the new conversation on purpose.
    confirmedConfigsRef.current.clear();
    trackEvent("assistant_conversation_new", {});
    dispatch({ type: "RESET" });
  }, [stopPolling]);

  const retry = useCallback(async () => {
    const conversationId = liveConvRef.current.id ?? state.conversationId;
    if (!conversationId) return;
    const projectId = liveConvRef.current.id
      ? liveConvRef.current.projectId
      : state.conversationProjectId;
    stopPolling();
    activeSendRef.current = null;
    const retryPollGeneration = pollGenerationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "GENERATING_SERVER" });
    try {
      const response = await fetch(`/api/assistant/conversations/${conversationId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
        signal: controller.signal,
      });
      if (retryPollGeneration !== pollGenerationRef.current) return;
      if (!response.ok) {
        if (response.status === 409) {
          // Another retry or recovery may already have moved the turn. Read
          // the authoritative status instead of leaving a stale retry action.
          startPolling(conversationId, projectId);
          return;
        }
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        dispatch({
          type: "ERROR",
          message: payload?.error || `HTTP ${response.status}`,
        });
        return;
      }
      startPolling(conversationId, projectId);
    } catch (error) {
      if (retryPollGeneration !== pollGenerationRef.current) return;
      if ((error as Error).name === "AbortError") return;
      // The request may have reached the durable retry boundary before the
      // connection failed. Polling reconciles the authoritative server state.
      startPolling(conversationId, projectId);
    }
  }, [state.conversationId, state.conversationProjectId, startPolling, stopPolling]);

  const abort = useCallback(() => {
    const sending = activeSendRef.current;
    if (sending) sending.frozen = true;
    stopPolling();
    const conversationId = sending?.conversationId ?? liveConvRef.current.id ?? state.conversationId;
    if (!conversationId) {
      dispatch({ type: "DONE" });
      return;
    }
    const projectId = sending ? sending.projectId : liveConvRef.current.id
      ? liveConvRef.current.projectId
      : state.conversationProjectId;
    // Freeze the projection immediately while the same request remains alive
    // to observe its durable cancellation and close its provider connection.
    dispatch({ type: "DONE" });
    const stopLoadGeneration = loadGenerationRef.current;
    const isCurrentStop = () => activeSendRef.current === sending
      && stopLoadGeneration === loadGenerationRef.current;
    void (async () => {
      try {
        const response = await fetch(sending
          ? "/api/assistant/turns/stop"
          : `/api/assistant/conversations/${conversationId}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sending ? {
            requestId: sending.requestId,
            conversationId: sending.conversationId,
            newConversation: sending.newConversation,
            ...(sending.turnId ? { turnId: sending.turnId } : {}),
          } : { action: "stop" }),
        });
        if (!isCurrentStop()) return;
        if (!response.ok && !(response.status === 409 && !sending)) {
          const payload = await response.json().catch(() => null) as { error?: string } | null;
          if (!isCurrentStop()) return;
          dispatch({
            type: "STOP_FAILED",
            message: payload?.error || `HTTP ${response.status}`,
          });
          return;
        }
        if (sending?.newConversation && !liveConvRef.current.id) {
          liveConvRef.current = { id: conversationId, projectId };
          dispatch({ type: "SET_CONVERSATION_ID", conversationId, projectId });
        }
        startPolling(conversationId, projectId, { quiet: true });
      } catch {
        if (!isCurrentStop()) return;
        dispatch({ type: "STOP_FAILED", message: tApi("serviceUnavailable") });
      }
    })();
    trackEvent("assistant_stopped", {});
  }, [state.conversationId, state.conversationProjectId, startPolling, stopPolling, tApi]);

  return {
    state,
    sendMessage,
    loadConversation,
    updateConversationConfig,
    reset,
    retry,
    abort,
  };
}

// ── SSE event dispatcher ───────────────────────────────────────────────

interface SSEContext {
  /** Legacy project metadata of the resumed conversation. */
  projectId: string | null;
  onConversationId?: (conversationId: string, turnId?: string) => void;
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
      onConversationId?.(data.conversationId as string,
        typeof data.turnId === "string" ? data.turnId : undefined);
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
    case "reasoning_delta":
      dispatch({ type: "REASONING_DELTA", text: data.text as string });
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
      if (data.status === "waiting_work" || data.status === "queued" || data.status === "running") {
        dispatch({ type: "GENERATING_SERVER" });
      } else {
        dispatch({ type: "DONE" });
      }
      break;
    case "error":
      // A transient in-request failure is NOT terminal: the server
      // checkpoints the turn as retryable and the drain re-queues it within
      // about a minute. The post-stream branch keeps polling from there —
      // an error card here would freeze the thread exactly where the
      // poll-loop comment forbids it.
      if (data.status !== "retryable") {
        dispatch({
          type: "ERROR",
          message: data.message as string,
          ...(typeof data.status === "string"
            ? { turnStatus: data.status as NumoTurnStatus }
            : {}),
        });
      }
      break;
  }
}
