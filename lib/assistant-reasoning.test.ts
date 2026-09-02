import { describe, expect, it } from "vitest";
import {
  ASSISTANT_REASONING_MAX_CHARS,
  appendAssistantReasoning,
  assistantMessageReasoning,
} from "./assistant-reasoning";
import type { AssistantMessage } from "./assistant-types";

function assistant(metadata: Record<string, unknown>): AssistantMessage {
  return {
    id: "message",
    conversation_id: "conversation",
    role: "assistant",
    content: "Done.",
    tool_calls: null,
    tool_call_id: null,
    tool_name: null,
    metadata,
    created_at: "2026-09-02T12:00:00.000Z",
  };
}

describe("assistant reasoning metadata", () => {
  it("reads a persisted reasoning trace", () => {
    expect(
      assistantMessageReasoning(
        assistant({ reasoning: { text: "Checked the context.", durationMs: 1250 } }),
      ),
    ).toEqual({ text: "Checked the context.", durationMs: 1250 });
  });

  it("ignores malformed or empty traces", () => {
    expect(assistantMessageReasoning(assistant({ reasoning: { text: "" } }))).toBeNull();
    expect(assistantMessageReasoning(assistant({ reasoning: true }))).toBeNull();
  });

  it("caps traces to the code-agent display limit", () => {
    const text = appendAssistantReasoning("a".repeat(1_999), "bc");
    expect(text).toHaveLength(ASSISTANT_REASONING_MAX_CHARS);
    expect(text.endsWith("b")).toBe(true);
  });
});
