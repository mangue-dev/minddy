// A routine instruction in the shared document editor: its saved mentions
// become typed links and come back with their identities and occurrences.
import { describe, expect, it } from "vitest";
import type { AssistantMention } from "@/lib/assistant-types";
import { promptFromMarkdown, promptToMarkdown } from "@/lib/prompt-document";

describe("routine prompts in the shared document editor", () => {
  const alice: AssistantMention = { type: "member", id: "u1", label: "Alice", avatarSeed: "seed-1" };
  const otherAlice: AssistantMention = { type: "member", id: "u2", label: "Alice", occurrence: 1 };

  it("reads an instruction saved with @Label tokens back as typed pills, each with its own identity", () => {
    const text = "## Triage\nAsk @Alice, then @Alice again, about /review.";
    const markdown = promptToMarkdown(text, [{ ...alice, occurrence: 0 }, otherAlice]);
    expect(markdown).toBe("## Triage\nAsk [@Alice](mention:member/u1), then [@Alice](mention:member/u2) again, about /review.");
  });

  it("stores the editor's Markdown with typed mentions and no label (MIN-872)", () => {
    const markdown = "Ask [@Alice](mention:member/u1) about [@](mention:pull_request/p1) on [@](mention:date/2026-11-02?time=09:30)";
    expect(promptFromMarkdown(markdown)).toEqual({
      text: "Ask [@](mention:member/u1) about [@](mention:pull_request/p1) on [@](mention:date/2026-11-02?time=09:30)",
      mentions: [],
    });
  });

  it("reads a known $name of an older instruction back as a skill pill", () => {
    const skills = [{ id: "release-notes", name: "release-notes" }];
    expect(promptToMarkdown("Run $release-notes, not $HOME", [], { projectId: "p1", skills }))
      .toBe("Run [@](mention:skill/release-notes?project=p1), not $HOME");
  });
});
