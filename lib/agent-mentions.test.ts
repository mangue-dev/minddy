import { describe, expect, it } from "vitest";
import {
  mentionsNote,
  parseAgentMentions,
  parseAgentUserMessage,
  promptWithMentions,
  splitAssistantMentionTokens,
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
    expect(mentionsNote(mentions)).toContain(
      "@Guide = wiki page (page id: page-1)",
    );
    expect(promptWithMentions("Lis @Guide", mentions)).toContain("Lis @Guide");
    expect(promptWithMentions("Lis @Guide", mentions)).toContain(
      "page id: page-1",
    );
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

  it("matches saved mentions as complete tokens", () => {
    const mentions = [
      { type: "issue" as const, id: "issue-4", label: "MIN-4" },
      { type: "issue" as const, id: "issue-42", label: "MIN-42" },
    ];

    expect(splitAssistantMentionTokens("Review @MIN-42", mentions)).toEqual([
      { text: "Review " },
      { mention: mentions[1], raw: "@MIN-42" },
    ]);
  });

  it("prefers a complete multiword label over its whitespace prefix", () => {
    const alice = {
      type: "member" as const,
      id: "alice",
      label: "Alice",
    };
    const aliceSmith = {
      type: "member" as const,
      id: "alice-smith",
      label: "Alice Smith",
    };

    expect(
      splitAssistantMentionTokens("Ask @Alice Smith", [alice, aliceSmith]),
    ).toEqual([{ text: "Ask " }, { mention: aliceSmith, raw: "@Alice Smith" }]);
  });

  it("keeps the persisted identity when a live entity could share its label", () => {
    const objective = {
      type: "objective" as const,
      id: "objective-roadmap",
      label: "Roadmap",
    };

    expect(splitAssistantMentionTokens("Open @Roadmap", [objective])).toEqual([
      { text: "Open " },
      { mention: objective, raw: "@Roadmap" },
    ]);
  });

  it("hydrates homonymous identities in their persisted occurrence order", () => {
    const objective = {
      type: "objective" as const,
      id: "objective-roadmap",
      label: "Roadmap",
    };
    const member = {
      type: "member" as const,
      id: "member-roadmap",
      label: "Roadmap",
    };

    expect(
      splitAssistantMentionTokens(
        "Ask @Roadmap, then review @Roadmap, then return to @Roadmap",
        [objective, member, objective],
      ),
    ).toEqual([
      { text: "Ask " },
      { mention: objective, raw: "@Roadmap" },
      { text: ", then review " },
      { mention: member, raw: "@Roadmap" },
      { text: ", then return to " },
      { mention: objective, raw: "@Roadmap" },
    ]);
  });
});
