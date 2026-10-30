// @vitest-environment jsdom
//
// Typed mentions: since MIN-872 a mention is stored as `[@](mention:type/id)`,
// without a name, with metadata in the query; links stored with a label
// (MIN-734) still parse. The reference survives the editor's Markdown round
// trip, the plan parser and relabeling.
import { describe, expect, it } from "vitest";
import {
  mentionHref,
  mentionLinks,
  mentionMarkdown,
  mentionPlainText,
  mentionedIds,
  parseMentionHref,
  relabelMentions,
  restoreStoredMentions,
  stripCutMention,
  withoutMentionLabels,
} from "@/lib/mention-link";
import { bodyFromMarkdown, bodyToMarkdown } from "@/lib/pages-markdown";
import { parsePlan } from "@/lib/plan";

const ISSUE = "9f1c2a3b-0000-4000-8000-000000000001";
const MEMBER = "5ad9b962-93e7-4a7c-a44b-f4925484ba93";

describe("the mention link format", () => {
  it("builds and reads typed references, and refuses anything else", () => {
    expect(mentionHref("issue", ISSUE)).toBe(`mention:issue/${ISSUE}`);
    expect(parseMentionHref(`mention:page/${ISSUE}`)).toEqual({ type: "page", id: ISSUE });
    expect(parseMentionHref("mention:secret/x")).toBeNull();
    expect(parseMentionHref("mention:issue/a/b")).toBeNull();
    expect(parseMentionHref("https://example.com")).toBeNull();
    expect(parseMentionHref("mention:pull_request/abc")).toEqual({ type: "pull_request", id: "abc" });
  });

  it("stores new mentions without a name, and metadata in the query", () => {
    expect(mentionMarkdown("issue", ISSUE)).toBe(`[@](mention:issue/${ISSUE})`);
    const date = mentionMarkdown("date", "2026-11-02", "", { time: "09:30", end: "2026-11-04" });
    expect(date).toBe("[@](mention:date/2026-11-02?time=09:30&end=2026-11-04)");
    expect(mentionLinks(`On ${date}`)).toEqual([
      { type: "date", id: "2026-11-02", label: "", meta: { time: "09:30", end: "2026-11-04" } },
    ]);
    expect(parseMentionHref("mention:skill/release?project=abc")).toEqual({
      type: "skill", id: "release", meta: { project: "abc" },
    });
    // Malformed metadata is not a mention.
    expect(parseMentionHref("mention:date/2026-11-02?time=<b>")).toBeNull();
    expect(parseMentionHref("mention:date/2026-11-02?time=1&time=2")).toBeNull();
    expect(mentionLinks("[@](mention:date/2026-11-02?x)")).toEqual([]);
  });

  it("round-trips label-less mentions with metadata through the editor", () => {
    const markdown = `Due ${mentionMarkdown("date", "2026-11-02", "", { time: "09:30" })} for ${mentionMarkdown("issue", ISSUE)}`;
    for (const profile of ["page", "document", "notebook"] as const) {
      expect(bodyToMarkdown(bodyFromMarkdown(markdown, profile), profile)).toBe(markdown);
    }
  });

  it("escapes labels and reads them back", () => {
    const markdown = `Ask ${mentionMarkdown("member", MEMBER, "Jean [Ops]")} about ${mentionMarkdown("issue", ISSUE, "MIN-42")}.`;
    expect(markdown).toBe(`Ask [@Jean \\[Ops\\]](mention:member/${MEMBER}) about [@MIN-42](mention:issue/${ISSUE}).`);
    expect(mentionLinks(markdown)).toEqual([
      { type: "member", id: MEMBER, label: "Jean [Ops]" },
      { type: "issue", id: ISSUE, label: "MIN-42" },
    ]);
    expect(mentionedIds(markdown, "member")).toEqual([MEMBER]);
    expect(mentionPlainText(markdown)).toBe("Ask @Jean [Ops] about @MIN-42.");
  });

  it("round-trips labels with Markdown punctuation through the editor", () => {
    const markdown = `See ${mentionMarkdown("page", ISSUE, "a *b* `c` | d_e [x]")}`;
    expect(bodyToMarkdown(bodyFromMarkdown(markdown, "document"), "document")).toBe(markdown);
    expect(mentionLinks(markdown)[0].label).toBe("a *b* `c` | d_e [x]");
  });

  it("stays fast on hostile text", () => {
    const started = performance.now();
    stripCutMention(`${"[@".repeat(50_000)}`);
    mentionLinks(`${"[@a".repeat(30_000)}](mention:issue/x)`);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("keeps nothing of a mention a truncation cut", () => {
    expect(stripCutMention("Fix [@Secret ro…")).toBe("Fix @…");
    expect(stripCutMention(`Fix [@Secret](mention:page/${ISSUE.slice(0, 6)}`)).toBe("Fix @…");
    expect(stripCutMention("Plain [@ text]")).toBe("Plain [@ text]");
    expect(stripCutMention("see [@\\[Draft\\] Secret pla…")).toBe("see @…");
  });

  it("gives an agent's copied mentions back their stored form", () => {
    const stored = `Review ${mentionMarkdown("page", ISSUE, "Secret roadmap")} today`;
    const seen = relabelMentions(stored, () => "unavailable");
    expect(restoreStoredMentions(seen, stored)).toBe(stored);
    // A new mention the agent adds is stored without its label (MIN-872).
    const added = `${seen} with ${mentionMarkdown("member", MEMBER, "Jean")}`;
    expect(restoreStoredMentions(added, stored)).toBe(`${stored} with [@](mention:member/${MEMBER})`);
    expect(restoreStoredMentions(`Ask [@Jean](mention:member/${MEMBER})`, null)).toBe(`Ask [@](mention:member/${MEMBER})`);
  });

  it("stores what an agent sends without labels, value by value", () => {
    const args = { description: `Ask [@Jean](mention:member/${MEMBER})`, tags: ["[@x] plain"], count: 2 };
    expect(withoutMentionLabels(args)).toEqual({
      description: `Ask [@](mention:member/${MEMBER})`, tags: ["[@x] plain"], count: 2,
    });
  });

  it("relabels without moving the reference", () => {
    const markdown = `See ${mentionMarkdown("page", ISSUE, "Secret roadmap")}`;
    expect(relabelMentions(markdown, () => "unavailable")).toBe(`See [@unavailable](mention:page/${ISSUE})`);
  });
});

describe("mentions through the editor's Markdown", () => {
  const markdown = `Fix ${mentionMarkdown("issue", ISSUE, "MIN-42")} with ${mentionMarkdown("member", MEMBER, "Jean Dupont")}, and tell @Numo.`;

  it("keeps the reference through a parse and a write", () => {
    for (const profile of ["page", "document", "notebook"] as const) {
      const doc = bodyFromMarkdown(markdown, profile);
      const nodes = JSON.stringify(doc);
      expect(nodes).toContain(`"mentionId":"${ISSUE}"`);
      expect(nodes).toContain(`"mentionType":"member"`);
      expect(bodyToMarkdown(doc, profile)).toBe(markdown);
    }
  });

  it("keeps the reference inside plan tasks, which still parse as tasks", () => {
    const plan = `## Steps\n\n- [ ] Review ${mentionMarkdown("issue", ISSUE, "MIN-42")}\n- [x] Ask ${mentionMarkdown("member", MEMBER, "Jean Dupont")}`;
    const back = bodyToMarkdown(bodyFromMarkdown(plan, "document"), "document");
    expect(back).toBe(plan);
    expect(parsePlan(back).tasks.map((task) => task.state)).toEqual(["pending", "completed"]);
  });

  it("leaves legacy @Label text as it was", () => {
    expect(bodyToMarkdown(bodyFromMarkdown("Ping @Jean Dupont", "document"), "document")).toBe("Ping @Jean Dupont");
  });
});
