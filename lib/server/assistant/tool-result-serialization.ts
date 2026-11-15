import { DEFAULT_TOOL_RESULT_CHAR_LIMIT, numoToolPolicy } from "./tool-policy";

/**
 * Cut a serialized tool result to `maxChars`. The marker says how much was
 * cut, so the model can name what it did not see instead of declaring the
 * whole document unreadable (MIN-779). History replay applies the same cut to
 * a stored result, so a document read whole in its turn stays whole on the
 * next message (MIN-974).
 */
function truncateToolResultText(full: string, maxChars: number): string {
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
  const limit = numoToolPolicy(toolName)?.resultLimit;
  if (typeof limit === "function") return limit(args);
  return limit ?? DEFAULT_TOOL_RESULT_CHAR_LIMIT;
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
