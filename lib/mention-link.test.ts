// @vitest-environment jsdom
//
// Typed mentions (MIN-734): a mention is stored as `[@Label](mention:type/id)`,
// and the reference survives the editor's Markdown round trip, the plan
// parser and relabeling.
import { describe, expect, it } from "vitest";
import {
  mentionHref,
  mentionLinks,
  mentionMarkdown,
  mentionPlainText,
  mentionedIds,
  parseMentionHref,
  relabelMentions,
  stripCutMention,
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

  it("keeps nothing of a mention a truncation cut", () => {
    expect(stripCutMention("Fix [@Secret ro…")).toBe("Fix @…");
    expect(stripCutMention(`Fix [@Secret](mention:page/${ISSUE.slice(0, 6)}`)).toBe("Fix @…");
    expect(stripCutMention("Plain [@ text]")).toBe("Plain [@ text]");
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
