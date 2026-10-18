// @vitest-environment jsdom
//
// The Markdown projection is what Numo, agents, the forge and exports read
// (MIN-728): comparison signs and arrows stay as typed, and only a "<" that
// would open an HTML tag is escaped, so the text reads back the same.
import { describe, expect, it } from "vitest";
import { bodyFromMarkdown, bodyToMarkdown } from "@/lib/pages-markdown";
import { escapeMarkdownTags } from "@/components/pages/page-extensions";

const roundTrip = (markdown: string, profile: "page" | "document" = "document") =>
  bodyToMarkdown(bodyFromMarkdown(markdown, profile), profile);

describe("angle brackets in the Markdown projection", () => {
  it("keeps comparison signs and arrows literal", () => {
    expect(roundTrip("if 5 > 3 then x < y")).toBe("if 5 > 3 then x < y");
    expect(roundTrip("a -> b, b <- a, a <= b")).toBe("a -> b, b <- a, a <= b");
  });

  it("escapes only what would read back as a tag", () => {
    expect(escapeMarkdownTags("add a <Button> and </div> or <!-- x -->, not 1 < 2"))
      .toBe("add a &lt;Button> and &lt;/div> or &lt;!-- x -->, not 1 < 2");
    const typed = { type: "doc", content: [{ type: "paragraph",
      content: [{ type: "text", text: "Render <Button> when 1 < 2" }] }] };
    const markdown = bodyToMarkdown(typed, "document");
    expect(markdown).toBe("Render &lt;Button> when 1 < 2");
    expect(JSON.stringify(bodyFromMarkdown(markdown, "document"))).toContain("Render <Button> when 1 < 2");
  });

  it("leaves code and quotes as they were", () => {
    expect(roundTrip("keep `a <b> c` here")).toBe("keep `a <b> c` here");
    expect(roundTrip("> quoted\n\nnot > quoted")).toBe("> quoted\n\nnot > quoted");
  });
});
