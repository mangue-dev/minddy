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
 * A hand-chosen context element (@ button on the composer): a ticket,
 * a project or a team member. The label comes from the client — it's only there
 * so Numo can name the thing without re-resolving its id.
 */
export interface AssistantPinnedContext {
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
  type: "member" | "project" | "issue" | "objective" | "page";
  id: string;
  /** The text written after the “@” in the message. */
  label: string;
  /** Members: the portrait seed — see AssistantPinnedContext.avatarSeed. */
  avatarSeed?: string;
  /** Objectifs : leur couleur — voir AssistantPinnedContext.color. */
  color?: string | null;
  /** Wiki pages: their emoji (MIN-273). */
  icon?: string | null;
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
  /**
   * The browser's IANA zone (MIN-185). Without it, "creates a routine every
   * Mondays at 1 p.m." would go into UTC without anyone knowing — and would find out weeks later, when the routine runs. This is
   * data that only the client knows: the server cannot guess it.
   */
  timezone?: string;
}
