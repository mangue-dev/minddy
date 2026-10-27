// A routine instruction in the shared document editor: its saved mentions
// become typed links and come back with their identities and occurrences.
import { describe, expect, it } from "vitest";
import type { AssistantMention } from "@/lib/assistant-types";
import { promptFromMarkdown, promptToMarkdown } from "@/lib/prompt-document";

describe("routine prompts in the shared document editor", () => {
  const alice: AssistantMention = { type: "member", id: "u1", label: "Alice", avatarSeed: "seed-1" };
  const otherAlice: AssistantMention = { type: "member", id: "u2", label: "Alice", occurrence: 1 };

  it("writes saved mentions as typed links and reads them back with their occurrences", () => {
    const text = "## Triage\nAsk @Alice, then @Alice again, about /review.";
    const markdown = promptToMarkdown(text, [{ ...alice, occurrence: 0 }, otherAlice]);
    expect(markdown).toBe("## Triage\nAsk [@Alice](mention:member/u1), then [@Alice](mention:member/u2) again, about /review.");

    const back = promptFromMarkdown(markdown, [alice]);
    expect(back.text).toBe(text);
    expect(back.mentions).toEqual([
      { type: "member", id: "u1", label: "Alice", avatarSeed: "seed-1", occurrence: 0 },
      { type: "member", id: "u2", label: "Alice", occurrence: 1 },
    ]);
  });

  it("keeps an attachment mention as plain text", () => {
    expect(promptFromMarkdown("See [@notes.pdf](mention:resource/r1)")).toEqual({ text: "See @notes.pdf", mentions: [] });
  });
});
