// A routine instruction keeps its stored form in the shared editor (MIN-728):
// plain text, "@Label" mentions with their saved identities and occurrences,
// "/name" skills — and nothing Markdown would merge or escape.
import { describe, expect, it } from "vitest";
import type { AssistantMention } from "@/lib/assistant-types";
import { promptFromDocument, promptToDocument } from "@/lib/prompt-document";
import type { RepositorySkillSummary } from "@/lib/repository-skills";

const alice = (id: string): AssistantMention => ({ type: "member", id, label: "Alice", avatarSeed: id });
const review: RepositorySkillSummary = {
  path: ".agents/skills/review/SKILL.md", name: "review", description: "Review a PR", source: ".agents/skills",
} as RepositorySkillSummary;

describe("routine prompt documents", () => {
  it("keeps lines, blank lines and characters Markdown would rewrite", () => {
    const text = "Read the board.\nIf 5 > 3, add a <Button>.\n\n  * keep_this_as_is *";
    const back = promptFromDocument(promptToDocument(text));
    expect(back.text).toBe(text);
    expect(back.mentions).toEqual([]);
  });

  it("gives two homonymous mentions back their own ids and occurrences", () => {
    const mentions = [{ ...alice("a1"), occurrence: 0 }, { ...alice("a2"), occurrence: 1 }];
    const text = "Ask @Alice, then @Alice again.";
    const doc = promptToDocument(text, { mentions });
    const pills = doc.content![0].content!.filter((node) => node.type === "mention");
    expect(pills.map((node) => node.attrs!.mentionId)).toEqual(["a1", "a2"]);
    const back = promptFromDocument(doc);
    expect(back.text).toBe(text);
    expect(back.mentions.map(({ id, occurrence }) => ({ id, occurrence }))).toEqual([
      { id: "a1", occurrence: 0 },
      { id: "a2", occurrence: 1 },
    ]);
  });

  it("counts plain-text tokens of the same label in the occurrence", () => {
    // The first "@Alice" was typed without picking anyone: it stays text.
    const doc = promptToDocument("@Alice and @Alice", { mentions: [{ ...alice("a2"), occurrence: 1 }] });
    expect(promptFromDocument(doc).mentions).toEqual([expect.objectContaining({ id: "a2", occurrence: 1 })]);
  });

  it("turns known skills into badges written back as /name", () => {
    const doc = promptToDocument("Run /review on /unknown", { skills: [review] });
    const types = doc.content![0].content!.map((node) => node.type);
    expect(types).toEqual(["text", "promptSkill", "text"]);
    expect(promptFromDocument(doc).text).toBe("Run /review on /unknown");
  });
});
