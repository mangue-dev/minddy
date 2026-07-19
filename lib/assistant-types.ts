// ── Numo (AI assistant) shared types ─────────────────────────────────

export type ConversationStatus = "idle" | "generating" | "error";

export interface Conversation {
  id: string;
  project_id: string | null;
  user_id: string;
  title: string | null;
  status: ConversationStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  /** Joined project name, present on list responses in global mode. */
  project?: { name: string } | null;
}

export interface AssistantToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface AssistantMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_calls: AssistantToolCall[] | null;
  tool_call_id: string | null;
  tool_name: string | null;
  /** On user messages, `metadata.attachments` carries the files sent with the
      message (AttachmentInput[] shape) — chat files have no DB row. */
  metadata: Record<string, unknown>;
  /**
   * The page context the message was sent with (open issue, board onglet…),
   * persisted so the chat can render a context badge above the user bubble.
   * Only set on user messages sent from a contextual surface; null otherwise.
   */
  context?: AssistantPageContext | null;
  created_at: string;
}

// SSE events for streaming assistant responses
export type AssistantSSEEvent =
  | { type: "content_delta"; data: { delta: string } }
  | { type: "tool_call_start"; data: { id: string; name: string } }
  | {
      type: "tool_call_args_delta";
      data: { id: string; delta: string };
    }
  | {
      type: "tool_call_complete";
      data: { id: string; name: string; arguments: string };
    }
  | {
      type: "tool_result";
      data: {
        id: string;
        name: string;
        result: unknown;
        success: boolean;
      };
    }
  | { type: "message_complete"; data: { message_id: string } }
  | { type: "error"; data: { message: string } }
  | { type: "done"; data: Record<string, never> };

/**
 * Structured "what the user is currently looking at" context, attached to a
 * chat request so Numo can resolve deictic references ("ce ticket", "cette
 * vue") to a concrete issue/board without guessing. Derived ambiently from
 * the page the user is on. Plain opens with no surface leave it undefined.
 * Client-set, server-validated.
 */
export interface AssistantPageContext {
  projectId?: string;
  /** Legacy (pre views-v2): the board tab the message was sent from. No longer
      populated — kept so old persisted messages still render their badge. */
  onglet?: "my" | "all";
  /** The issue open in the side panel (or selected in triage), when any. */
  issueId?: string;
  /** Issues selected for a bulk assistant request. */
  issueIds?: string[];
  issueIdentifiers?: string[];
  issueTitles?: string[];
  /** Human identifier ("MIND-42") — used for the context badge. */
  issueIdentifier?: string;
  issueTitle?: string;
  /** The objective whose filtered board is displayed, when any. */
  objectiveId?: string;
  objectiveName?: string;
  /** The feedback post open in the team dashboard, when any (MIN-52). */
  feedbackId?: string;
  feedbackTitle?: string;
  /** The pull request open on the Pull Requests page, when any (MIN-66). It maps
      to `issueId` above (the issue the code agent implemented). */
  prNumber?: number;
  prState?: string;
  /** Canonical agent run id backing the PR — what read_pull_request resolves. */
  prRunId?: string;
  /** The saved kanban view currently selected on the board, when any. */
  viewId?: string;
  viewName?: string;
  /** The cycle displayed in cycle mode (MIN-32), when any. */
  cycleId?: string;
  /** Human date-range label ("6–19 juil") — used for the context badge. */
  cycleLabel?: string;
}

// Request body for chat endpoint
export interface AssistantChatRequest {
  conversationId?: string;
  projectId?: string;
  message: string;
  /**
   * What the user is currently viewing (open issue, board onglet, objective).
   * Injected into the system prompt so Numo can resolve "ce ticket" precisely.
   * Carried on the messages of the originating session.
   */
  pageContext?: AssistantPageContext;
  /**
   * Files already uploaded to the `attachments` bucket under `chat/{uid}/…`
   * (AttachmentInput[] shape) — validated server-side against that prefix and
   * persisted on the user message's metadata.
   */
  attachments?: Array<{
    storage_path: string;
    file_name: string;
    mime_type: string;
    size_bytes: number;
  }>;
}
