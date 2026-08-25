import { describe, expect, it } from "vitest";

import {
  ROUTINE_LIST_RESULT_CHAR_LIMIT,
  ROUTINE_TOOL_RESULT_CHAR_LIMIT,
} from "./routine-tool-result";
import {
  getToolResultCharLimit,
  serializeToolResult,
} from "./tool-result-serialization";

describe("Numo tool result serialization", () => {
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
