import { describe, expect, it } from "vitest";
import {
  delegatedWorkHiddenQuestion,
  delegatedWorkProgress,
  delegatedWorkState,
} from "./delegated-work-state";
import type { AgentRunEvent } from "./agent-api";

const event = (
  seq: number,
  type: AgentRunEvent["type"],
  payload: Record<string, unknown> = {},
): AgentRunEvent => ({ id: `event-${seq}`, seq, type, payload, created_at: "2026-09-13T12:00:00Z" });

describe("delegated work projection", () => {
  it("keeps terminal and waiting states distinct", () => {
    const call = { status: "complete" as const, success: true };
    expect(delegatedWorkState(call, { status: "completed", awaiting_input: true })).toBe("waiting_input");
    expect(delegatedWorkState(call, { status: "completed", awaiting_input: false })).toBe("completed");
    expect(delegatedWorkState(call, { status: "failed", awaiting_input: false })).toBe("failed");
    expect(delegatedWorkState(call, { status: "canceled", awaiting_input: false })).toBe("canceled");
  });

  it("counts persisted activity and unique changed files", () => {
    expect(delegatedWorkProgress([
      event(1, "thinking"),
      event(2, "tool_result"),
      event(3, "files_changed", { files: [
        { path: "a.ts", status: "modified", additions: 1, deletions: 0 },
        { path: "b.ts", status: "added", additions: 2, deletions: 0 },
      ] }),
      event(4, "files_changed", { files: [
        { path: "a.ts", status: "modified", additions: 3, deletions: 1 },
      ] }),
    ])).toEqual({ activityCount: 3, changedFileCount: 2 });
  });

  it("hides only the unresolved worker question from the detail feed", () => {
    const events = [event(1, "question")];
    expect(delegatedWorkHiddenQuestion(events, true)).toBe("event-1");
    expect(delegatedWorkHiddenQuestion([...events, event(2, "user_message")], true)).toBeNull();
    expect(delegatedWorkHiddenQuestion(events, false)).toBeNull();
  });
});
