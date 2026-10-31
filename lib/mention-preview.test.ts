import { describe, expect, it } from "vitest";
import { cutExcerpt, EXCERPT_CHARS, isPreviewMentionType } from "./mention-preview";

describe("cutExcerpt", () => {
  it("keeps a short text whole", () => {
    expect(cutExcerpt("  # Spec\n\nShip it.  ")).toBe("# Spec\n\nShip it.");
    expect(cutExcerpt(null)).toBe("");
  });

  it("cuts a long text at a line boundary and marks the cut", () => {
    const line = `${"word ".repeat(19)}end`;
    const text = Array.from({ length: 20 }, () => line).join("\n");
    const cut = cutExcerpt(text);
    expect(cut.length).toBeLessThanOrEqual(EXCERPT_CHARS + 3);
    expect(cut.endsWith("end\n\n…")).toBe(true);
  });

  it("closes a code block or a callout the cut left open", () => {
    const code = cutExcerpt(`Intro\n\n\`\`\`ts\n${"const a = 1;\n".repeat(120)}\`\`\``);
    expect(code.match(/```/g)).toHaveLength(2);
    const callout = cutExcerpt(`<aside data-type="callout">\n\n${"Note line.\n".repeat(120)}\n</aside>`);
    expect(callout).toMatch(/<\/aside>\n\n…$/);
  });
});

describe("isPreviewMentionType", () => {
  it("leaves dates and resources to their own hover", () => {
    expect(isPreviewMentionType("issue")).toBe(true);
    expect(isPreviewMentionType("skill")).toBe(true);
    expect(isPreviewMentionType("date")).toBe(false);
    expect(isPreviewMentionType("resource")).toBe(false);
    expect(isPreviewMentionType("unavailable")).toBe(false);
  });
});
