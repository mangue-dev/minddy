import { MCP_MAX_RESULT_BYTES } from "@/lib/mcp-client-tools";
import {
  ROUTINE_LIST_RESULT_CHAR_LIMIT,
  ROUTINE_RUNS_TOOL_RESULT_CHAR_LIMIT,
  ROUTINE_TOOL_RESULT_CHAR_LIMIT,
} from "./routine-tool-result";

/**
 * The ceiling of a tool without its own: about 4K tokens. At 4,000 characters
 * most list reads (pages, cycle, feedback, settings) were cut mid-array, and
 * the model then guessed the ids it did not see (MIN-974).
 */
export const DEFAULT_TOOL_RESULT_CHAR_LIMIT = 16_000;

/**
 * Documents Numo reads to act on: their text must arrive whole, or the model
 * works from the first sections only (MIN-779). A plan, a description and the
 * notebook each hold up to 65,536 characters, and an issue read carries its
 * plan, its description and its comments together. This ceiling (about 25K
 * tokens) keeps such a read whole, JSON escaping included, and stays below the
 * smallest compaction threshold Numo uses for an unknown model (MIN-974).
 */
export const DOCUMENT_READ_RESULT_CHAR_LIMIT = 100_000;

/**
 * Cut a serialized tool result to `maxChars`. The marker says how much was
 * cut, so the model can name what it did not see instead of declaring the
 * whole document unreadable (MIN-779). History replay applies the same cut to
 * a stored result, so a document read whole in its turn stays whole on the
 * next message (MIN-974).
 */
export function truncateToolResultText(full: string, maxChars: number): string {
  if (full.length <= maxChars) return full;
  return `${full.slice(0, maxChars)}... [truncated: only the first ${maxChars} of ${full.length} characters of this result were shown]`;
}

/** Serialize a tool result for the model while keeping the full value in message storage. */
export function serializeToolResult(
  result: unknown,
  maxChars = DEFAULT_TOOL_RESULT_CHAR_LIMIT,
): string {
  return truncateToolResultText(JSON.stringify(result) ?? "null", maxChars);
}

export function getToolResultCharLimit(
  toolName: string,
  args: Record<string, unknown> = {},
): number {
  switch (toolName) {
    case "list_conversation_attachments":
    case "read_conversation_attachment":
      return 24_000;
    // MCP results are already byte-bounded; preserve schemas and pagination.
    case "list_mcp_tools":
    case "call_mcp_tool":
      return MCP_MAX_RESULT_BYTES;
    // Issue lists must never reach the model truncated mid-array: a partial id
    // list makes the model hallucinate issue ids on the next write.
    case "list_issues":
    case "search_issues":
    case "list_inbox":
      return 24_000;
    // A targeted routine may contain a 20,000-character instruction. The
    // default call stays compact, while this ceiling preserves the full JSON
    // when routine_id asks for the instruction before a safe replacement.
    case "list_routines":
      return typeof args.routine_id === "string" && args.routine_id.length > 0
        ? ROUTINE_TOOL_RESULT_CHAR_LIMIT
        : ROUTINE_LIST_RESULT_CHAR_LIMIT;
    // A routine's run history stays whole: a truncated tail would hide the
    // most recent occurrences, which are the ones the user asks about.
    case "list_routine_runs":
    case "read_routine_occurrence":
      return ROUTINE_RUNS_TOOL_RESULT_CHAR_LIMIT;
    // A page of a past conversation: read_conversation bounds the page itself
    // and says where the next one starts, so the cut never applies.
    case "read_conversation":
      return 32_000;
    // The pull request's body, up to 30 conversation comments of 2,000
    // characters, its review threads and file patches of 4,000 characters.
    case "read_pull_request":
      return 64_000;
    case "get_issue":
    case "get_scratchpad":
    case "get_page":
    case "get_objective":
    case "get_feedback":
    // A manual article runs to about 70,000 characters (the issues guide).
    case "get_help":
      return DOCUMENT_READ_RESULT_CHAR_LIMIT;
    default:
      return DEFAULT_TOOL_RESULT_CHAR_LIMIT;
  }
}

type StoredToolCall = { id?: unknown; function?: { arguments?: unknown } | null };

/**
 * The arguments of every tool call in a stored history, by call id. A replayed
 * result takes its ceiling from its own call: `list_routines` is larger when
 * it targeted one routine.
 */
export function toolCallArgumentsById(
  messages: ReadonlyArray<{ tool_calls?: ReadonlyArray<StoredToolCall> | null }>,
): Map<string, Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();
  for (const message of messages) {
    for (const call of message.tool_calls ?? []) {
      if (typeof call.id !== "string") continue;
      const raw = call.function?.arguments;
      let args: unknown = null;
      try {
        args = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        args = null;
      }
      byId.set(call.id, args && typeof args === "object" && !Array.isArray(args)
        ? args as Record<string, unknown>
        : {});
    }
  }
  return byId;
}

/**
 * A tool result from an earlier turn, as the model reads it again: the stored
 * JSON under the same ceiling as in its own turn. The chat-message cap
 * (12,000 characters, whitespace collapsed) cut a page or a plan read whole
 * one message earlier, and Numo then said it could not read it (MIN-974).
 */
export function replayedToolResult(
  content: string | null | undefined,
  toolName: string | null | undefined,
  args: Record<string, unknown> = {},
): string {
  return truncateToolResultText(
    typeof content === "string" ? content : "",
    getToolResultCharLimit(toolName ?? "", args),
  );
}
