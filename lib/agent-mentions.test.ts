import { describe, expect, it } from "vitest";
import {
  mentionsNote,
  parseAgentMentions,
  parseAgentUserMessage,
  promptWithMentions,
} from "./agent-mentions";

describe("agent mentions", () => {
  it("keeps valid structured mentions and drops forged fields", () => {
    expect(
      parseAgentMentions([
        { type: "issue", id: "issue-1", label: "MIN-42" },
        { type: "unknown", id: "x", label: "Nope" },
        { type: "member", id: "user-1", label: "Alice", avatarSeed: "seed" },
      ]),
    ).toEqual([
      { type: "issue", id: "issue-1", label: "MIN-42" },
      { type: "member", id: "user-1", label: "Alice", avatarSeed: "seed" },
    ]);
  });

  it("adds stable ids to the prompt without changing visible text", () => {
    const mentions = [{ type: "page", id: "page-1", label: "Guide" }];
    expect(mentionsNote(mentions)).toContain("@Guide = wiki page (page id: page-1)");
    expect(promptWithMentions("Lis @Guide", mentions)).toContain("Lis @Guide");
    expect(promptWithMentions("Lis @Guide", mentions)).toContain("page id: page-1");
  });

  it("accepts legacy plain steering messages", () => {
    expect(parseAgentUserMessage("continue")).toEqual({ text: "continue" });
    expect(
      parseAgentUserMessage({
        text: "regarde @MIN-42",
        mentions: [{ type: "issue", id: "issue-1", label: "MIN-42" }],
      }),
    ).toEqual({
      text: "regarde @MIN-42",
      mentions: [{ type: "issue", id: "issue-1", label: "MIN-42" }],
    });
  });
});
