import { describe, expect, it } from "vitest";
import { conversationReasoningLevels } from "@/lib/conversation-settings";

describe("conversation reasoning levels", () => {
  it("always starts at no reasoning and follows the canonical effort order", () => {
    expect(conversationReasoningLevels(["high", "minimal", "low"])).toEqual([
      "off",
      "minimal",
      "low",
      "high",
    ]);
  });
});
