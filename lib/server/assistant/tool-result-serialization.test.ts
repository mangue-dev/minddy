import { describe, expect, it } from "vitest";
import { MCP_MAX_RESULT_BYTES } from "@/lib/mcp-client-tools";

import {
  ROUTINE_LIST_RESULT_CHAR_LIMIT,
  ROUTINE_TOOL_RESULT_CHAR_LIMIT,
} from "./routine-tool-result";
import {
  getToolResultCharLimit,
  serializeToolResult,
} from "./tool-result-serialization";

describe("Numo tool result serialization", () => {
  it.each([
    {
      name: "list_mcp_tools",
      result: {
        tools: Array.from({ length: 100 }, (_, index) => ({
          name: `tool_${index}`,
          description: "d".repeat(300),
          inputSchema: { type: "object", properties: {} },
        })),
        nextCursor: "page-2",
        nextOffset: 100,
      },
    },
    {
      name: "list_mcp_tools",
      result: {
        tool: {
          name: "large_schema",
          inputSchema: {
            type: "object",
            properties: Object.fromEntries(
              Array.from({ length: 100 }, (_, index) => [
                `field_${index}`,
                { type: "string", description: "d".repeat(400) },
              ]),
            ),
            required: ["field_99"],
          },
        },
      },
    },
    {
      name: "call_mcp_tool",
      result: { content: [{ type: "text", text: "\\".repeat(30_000) }] },
    },
  ])("preserves complete MCP results for $name", ({ name, result }) => {
    const full = JSON.stringify(result);
    expect(full.length).toBeGreaterThan(4_000);
    expect(Buffer.byteLength(full)).toBeLessThanOrEqual(MCP_MAX_RESULT_BYTES);
    const serialized = serializeToolResult(result, getToolResultCharLimit(name));
    expect(JSON.parse(serialized)).toEqual(result);
  });

  it("keeps a maximum-length targeted routine instruction intact", () => {
    // Backslashes exercise JSON escaping, which is larger than ordinary prose.
    const result = {
      routines: [{ id: "routine-1", prompt: "\\".repeat(20_000) }],
    };
    const serialized = serializeToolResult(
      result,
      getToolResultCharLimit("list_routines", { routine_id: "routine-1" }),
    );

    expect(
      getToolResultCharLimit("list_routines", { routine_id: "routine-1" }),
    ).toBe(ROUTINE_TOOL_RESULT_CHAR_LIMIT);
    expect(serialized).not.toContain("... [truncated]");
    expect(JSON.parse(serialized)).toEqual(result);
  });

  it("uses the smaller list ceiling when no instruction is requested", () => {
    expect(getToolResultCharLimit("list_routines")).toBe(
      ROUTINE_LIST_RESULT_CHAR_LIMIT,
    );
  });

  it("retains the default ceiling for unrelated tools", () => {
    expect(serializeToolResult({ value: "x".repeat(5_000) })).toContain(
      "... [truncated]",
    );
  });
});
