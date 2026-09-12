import type { ReasoningLevel } from "./agent-reasoning";

// ── Numo (AI assistant) shared types ─────────────────────────────────

export type ConversationStatus = "idle" | "generating" | "error";
export type NumoTurnStatus =
  | "queued"
  | "running"
  | "waiting_work"
  | "waiting_input"
  | "stopping"
  | "stopped"
  | "retryable"
  | "reconciling"
  | "completed"
  | "failed";

export interface NumoTurnActivity {
  id: string;
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

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

/** Source IDs are namespaced: a worker run is a work reference, never a chat. */
export type NumoLegacySource = "assistant" | "agent" | "run";

export interface NumoConversation extends Omit<Conversation, "user_id"> {
  user_id: string | null;
  source: "assistant" | "agent";
  legacy_id: string;
  /** Membership scope; independent of optional project context. */
  access_project_id: string | null;
  visibility: "private" | "project";
  archived_at: string | null;
  pinned_at: string | null;
  last_read_at: string | null;
  detail_href: string | null;
  latest_work_id: string | null;
  /** Explicit conversation choice; null preserves the account default. */
  model?: string | null;
  /** Explicit conversation choice; null preserves the compatible legacy default. */
  reasoning_level?: ReasoningLevel | null;
}

export interface NumoMessage extends AssistantMessage {
  source: "assistant" | "agent";
  kind: "message" | "action" | "worker_message";
  turn_id: string | null;
  run_id: string | null;
  worker_source: string | null;
  legacy_queue_message_id: string | null;
  legacy_event_id: string | null;
}

export interface NumoWorkReference {
  id: string;
  conversation_id: string;
  work_conversation_id: string;
  legacy_conversation_id: string;
  project_id: string;
  issue_id: string | null;
  pull_request_id: string | null;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  title: string | null;
  branch_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: "draft" | "open" | "merged" | "closed" | null;
  routine_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
  visibility: "private" | "project";
  pinned_at: string | null;
  last_read_at: string | null;
  detail_href: string;
}

export interface NumoConversationDetail {
  conversation: NumoConversation;
  /** Worker records retain kind=worker_message and their original provenance. */
  messages: NumoMessage[];
  actions: NumoMessage[];
  work: NumoWorkReference[];
  contexts: Array<{
    id: string; conversation_id: string; kind: string; resource_id: string;
    role: string; snapshot: Record<string, unknown>; created_at: string;
  }>;
  artifacts: Array<{
    id: string; conversation_id: string; run_id: string | null;
    kind: "branch" | "pull_request"; ref: string; url: string | null;
    state: string | null; created_at: string; updated_at: string;
  }>;
  turns: Array<{
    id: string; conversation_id: string; run_id: string;
    status: NumoWorkReference["status"] | NumoTurnStatus; model: string | null;
    reasoning_level: string | null; initiated_by: string | null;
    cost_usd: number; outcome: string | null; error_message: string | null;
    started_at: string | null; completed_at: string | null;
    created_at: string; updated_at: string;
  }>;
}

export interface NumoConversationPatch {
  title?: string | null;
  pinned?: boolean;
  archived?: boolean;
  read?: boolean;
  /** Empty or null follows the active assistant provider default. */
  model?: string | null;
  /** Null follows the instance assistant reasoning default. */
  reasoningLevel?: ReasoningLevel | null;
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
  | { type: "reasoning_start"; data: { started_at: string } }
  | { type: "reasoning_tick"; data: { duration_ms: number } }
  | { type: "reasoning_end"; data: { duration_ms: number; text: string } }
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
  | { type: "error"; data: { message: string; status?: NumoTurnStatus } }
  | { type: "done"; data: { status?: ConversationStatus | NumoTurnStatus } };

/**
 * A hand-chosen context element (@ button on the composer): a ticket,
 * a project or a team member. The label comes from the client — it's only there
 * so Numo can name the thing without re-resolving its id.
 */
export interface AssistantPinnedContext {
  /** Validated project provenance of the referenced resource. */
  projectId?: string;
  kind: "issue" | "project" | "member" | "objective" | "page";
  id: string;
  /** Examples such as “MIN-42”, “minddy”, and “Clément Guérin” — what the pill displays. */
  label: string;
  /** Secondary detail: ticket title, member email. */
  detail?: string;
  /** Members: the portrait seed (public.user_avatars), which is NOT
 still the user_id — inferring it would show another face. */
  avatarSeed?: string;
  /** Objectives: their color — this is what their target wears, here like
 everywhere else in the application. */
  color?: string | null;
  /** Wiki pages: their emoji, when they have one. */
  icon?: string | null;
}

/**
 * A “/” command chosen from the composer slash menu. The id is canonical
 * (the label is localized - "/create issue" / "/create ticket"):
 * it is he who travels in the request and persists on `metadata.command`
 * of the user message, where the server unfolds it into instructions for Numo.
 */
export type AssistantCommandId = "create-issue";

/**
 * An "@" mention written IN the message (team member, project, ticket
 * or goal), resolved at the time of typing. Persisted on
 * `metadata.mentions` of the user message: it is used to return the pill
 * to the bubble, and to tell Numo who/what this name designates exactly.
 */
export interface AssistantMention {
  projectId?: string;
  type: "member" | "project" | "issue" | "objective" | "page";
  id: string;
  /** The text written after the “@” in the message. */
  label: string;
  /** Zero-based occurrence of this exact token label in a persisted prompt. */
  occurrence?: number;
  /** Members: the portrait seed — see AssistantPinnedContext.avatarSeed. */
  avatarSeed?: string;
  /** Objectives: their color; see AssistantPinnedContext.color. */
  color?: string | null;
  /** Wiki pages: their emoji (MIN-273). */
  icon?: string | null;
}

/** A repository skill explicitly attached to one Numo message. */
export interface AssistantSkillSelection {
  projectId?: string;
  /** Repository-relative SKILL.md entrypoint; it is the stable selection id. */
  path: string;
  name: string;
  description: string;
}

/**
 * Structured "what the user is currently looking at" context, attached to a
 * chat request so Numo can resolve deictic references ("this ticket", "this
 * view") to a concrete issue/board without guessing. Derived ambiently from
 * the page the user is on. Plain opens with no surface leave it undefined.
 * Client-set, server-validated.
 */
export interface AssistantPageContext {
  projectId?: string;
  /** The account-level inbox is the current ambient surface. */
  inbox?: true;
  /** The settings surface the assistant was opened from. */
  settings?: "account" | "project";
  /**
   * Context PINED by hand from the composer (@ button), as opposed to
   * from the rest of this object, inferred from the page. It survives navigation: it's
   * the user who chose it, not the page that published it.
   */
  pinned?: AssistantPinnedContext[];
  /** Legacy (pre views-v2): the board tab the message was sent from. No longer
      populated — kept so old persisted messages still render their badge. */
  onglet?: "my" | "all";
  /** The issue open in the side panel (or selected in triage), when any. */
  issueId?: string;
  /** Issues selected for a bulk assistant request. */
  issueIds?: string[];
  /** Project provenance aligned with issueIds, resolved by the server. */
  issueProjectIds?: string[];
  issueIdentifiers?: string[];
  issueTitles?: string[];
  /** Human identifier ("MIND-42") — used for the context badge. */
  issueIdentifier?: string;
  issueTitle?: string;
  /** The objective whose filtered board is displayed, when any. */
  objectiveId?: string;
  objectiveName?: string;
  /** Its color — what its target wears on the context pill. */
  objectiveColor?: string | null;
  /** The feedback post open in the team dashboard, when any (MIN-52). */
  feedbackId?: string;
  feedbackTitle?: string;
  /** The routine open in the Agents page's Routines tab, when any (MIN-185). */
  routineId?: string;
  routineTitle?: string;
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
  /**
   * The opened wiki PAGE (MIN-273). The title travels with the id so that the
   * pill says it without rereading the page, and so that Numo can name it before
   * its first call of tool.
   */
  pageId?: string;
  pageTitle?: string;
  pageIcon?: string | null;
}

// Request body for chat endpoint
export interface AssistantChatRequest {
  /** Idempotency key for one user intent. Reuse it when the same POST is retried. */
  requestId?: string;
  conversationId?: string;
  projectId?: string;
  message: string;
  /** Model selected for this conversation; omitted/null follows its default. */
  model?: string | null;
  /** Reasoning selected for this conversation; omitted/null follows its default. */
  reasoningLevel?: ReasoningLevel | null;
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
  /**
   * The "@" written in the message (members, projects), resolved on the client side.
   * Persisted on the message metadata and given to Numo in the form of a
   * resolution line name → id.
   */
  mentions?: AssistantMention[];
  /**
   * The “/” command placed at the top of the message, when there is one. Validated
   * server, persisted on the message metadata and unfolded as a block
   * of instructions attached to this message (same mechanics as the mentions).
   */
  command?: AssistantCommandId;
  /** Repository entrypoints selected through the slash or add menu. */
  skillPaths?: string[];
  skills?: AssistantSkillSelection[];
  /**
   * The browser's IANA zone (MIN-185). Without it, "creates a routine every
   * Mondays at 1 p.m." would go into UTC without anyone knowing — and would find out weeks later, when the routine runs. This is
   * data that only the client knows: the server cannot guess it.
   */
  timezone?: string;
}
