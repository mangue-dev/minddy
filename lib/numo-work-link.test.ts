import { describe, expect, it } from "vitest";
import { numoWorkDetailPath } from "./numo-work-link";

describe("numoWorkDetailPath", () => {
  it("targets delegated work in its parent conversation", () => {
    expect(numoWorkDetailPath({
      id: "run/1",
      conversation_id: "parent conversation",
      work_conversation_id: "worker-conversation",
      detail_href: "/agents?run=legacy",
    })).toBe("/numo?conversation=parent%20conversation&work=run%2F1");
  });

  it("keeps standalone work on its dedicated surface", () => {
    expect(numoWorkDetailPath({
      id: "run-1",
      conversation_id: "conversation-1",
      work_conversation_id: "conversation-1",
      detail_href: "/agents?run=run-1",
    })).toBe("/agents?run=run-1");
  });
});
