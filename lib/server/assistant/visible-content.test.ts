import { describe, expect, it } from "vitest";
import { visibleAssistantContent } from "./visible-content";

describe("visible assistant content", () => {
  it("hides raw tool calls and keeps surrounding prose", () => {
    expect(visibleAssistantContent('Stopped.<tool_call>launch_code_agent<arg_key>objective</arg_key></tool_call> Ask to resume.'))
      .toBe("Stopped. Ask to resume.");
  });
  it("never streams a partial protocol opening or unfinished arguments", () => {
    const text = "Stopped.<tool_call>launch_code_agent<arg_value>private arguments";
    for (let end = "Stopped.".length; end <= text.length; end++) {
      expect(visibleAssistantContent(text.slice(0, end))).toBe("Stopped.");
    }
  });
  it("preserves ordinary comparisons and HTML text", () => {
    expect(visibleAssistantContent("Use <code> and x < y.")).toBe("Use <code> and x < y.");
  });
});
