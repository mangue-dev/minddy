import { MCP_MAX_RESULT_BYTES } from "@/lib/mcp-client-tools";
import {
  ROUTINE_LIST_RESULT_CHAR_LIMIT,
  ROUTINE_TOOL_RESULT_CHAR_LIMIT,
} from "./routine-tool-result";

/** Serialize a tool result for the model while keeping the full value in message storage. */
export function serializeToolResult(result: unknown, maxChars = 4_000): string {
  const full = JSON.stringify(result);
  if (full.length <= maxChars) return full;
  return `${full.slice(0, maxChars)}... [truncated]`;
}

export function getToolResultCharLimit(
  toolName: string,
  args: Record<string, unknown> = {},
): number {
  switch (toolName) {
    // MCP results are already byte-bounded; preserve schemas and pagination.
    case "list_mcp_tools":
    case "call_mcp_tool":
      return MCP_MAX_RESULT_BYTES;
    // Issue lists must never reach the model truncated mid-array: a partial id
    // list makes the model hallucinate issue ids on the next write.
    case "list_issues":
    case "search_issues":
    case "get_issue":
    case "list_inbox":
      return 12_000;
    // A targeted routine may contain a 20,000-character instruction. The
    // default call stays compact, while this ceiling preserves the full JSON
    // when routine_id asks for the instruction before a safe replacement.
    case "list_routines":
      return typeof args.routine_id === "string" && args.routine_id.length > 0
        ? ROUTINE_TOOL_RESULT_CHAR_LIMIT
        : ROUTINE_LIST_RESULT_CHAR_LIMIT;
    // A web search is paid for: truncating it to 4,000 characters would throw
    // away half of the extracts we just bought.
    case "web_search":
      return 10_000;
    case "get_help":
      return 24_000;
    default:
      return 4_000;
  }
}
