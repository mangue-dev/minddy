// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { pageExtensions } from "@/components/pages/page-extensions";
import {
  automaticCalloutColor,
  activeCalloutColor,
  blockById,
  setCalloutColor,
} from "@/components/pages/blocks";
import { normalizeNotionCalloutPaste } from "@/components/pages/blocks/callout";
import { turnBlocksInto } from "@/components/pages/block-actions";
import { insertNotionCalloutPaste } from "@/lib/pages-callout-paste";
import { bodyFromMarkdown, bodyToMarkdown } from "@/lib/pages-markdown";

function editorWith(content: string) {
  return new Editor({
    element: document.createElement("div"),
    content,
    extensions: pageExtensions({ headless: true }),
  });
}

describe("page callouts", () => {
  it("derives an automatic background from familiar icon semantics", () => {
    expect(automaticCalloutColor("💡")).toBe("amber");
    expect(automaticCalloutColor("✅")).toBe("green");
    expect(automaticCalloutColor("❌")).toBe("red");
    expect(automaticCalloutColor("ℹ️")).toBe("blue");
    expect(automaticCalloutColor("📝")).toBe("gray");
  });

  it("imports Notion's compact escaped clipboard form", () => {
    const compactCopy = [
      "\\<aside>\\",
      "💡",
      "**Nom retenu : Parmi**",
      "**Signature : Des personnes qui te connaissent.**",
      "Ne plus demander à l’utilisateur de choisir un modèle, mais de choisir la personne avec laquelle il souhaite réfléchir.",
      "Le produit est une équipe de personnes IA persistantes qui partagent une compréhension commune de l’utilisateur et de ses projets.",
      "\\<aside/>",
      "\\<aside>\\",
      "✅",
      "**Décision de nommage — 30 août 2026**",
      "Le nom de travail officiel du projet est **Parmi**.",
      "Le nom exprime le fait d’être entouré de plusieurs personnes et place la relation avant la technologie.",
      "Ce choix reste soumis à une vérification juridique des marques et des domaines avant toute communication publique.",
      "\\</aside>",
    ].join("\n");

    const normalized = normalizeNotionCalloutPaste(compactCopy);
    expect(normalized).toContain("<aside>\n💡\n\n**Nom retenu : Parmi**");
    expect(normalized).not.toContain("\\<aside>");
    expect(normalized).not.toContain("<aside/>");

    const content = bodyFromMarkdown(compactCopy);
    expect(content.content).toHaveLength(2);
    expect(content.content?.[0]).toMatchObject({
      type: "callout",
      attrs: { icon: "💡", color: null },
    });
    expect(content.content?.[1]).toMatchObject({
      type: "callout",
      attrs: { icon: "✅", color: null },
    });
    expect(content.content?.[0]?.content).toHaveLength(4);
    expect(JSON.stringify(content)).not.toContain("**Nom retenu");
    expect(JSON.stringify(content)).toContain('"type":"bold"');

    const editor = editorWith("");
    expect(insertNotionCalloutPaste(editor, compactCopy)).toBe(true);
    expect(editor.getJSON().content?.slice(0, 2)).toMatchObject([
      { type: "callout", attrs: { icon: "💡" } },
      { type: "callout", attrs: { icon: "✅" } },
    ]);
    editor.destroy();
  });

  it("imports Notion's bare aside copy format and promotes its icon line", () => {
    const notionCopy = [
      "<aside>",
      "💡",
      "",
      "**Nom retenu : Parmi**",
      "",
      "**Signature : Des personnes qui te connaissent.**",
      "",
      "Ne plus demander à l’utilisateur de choisir un modèle, mais de choisir la personne avec laquelle il souhaite réfléchir.",
      "",
      "Le produit est une équipe de personnes IA persistantes.",
      "",
      "</aside>",
      "",
      "<aside>",
      "✅",
      "",
      "**Décision de nommage — 30 août 2026**",
      "",
      "Le nom de travail officiel du projet est **Parmi**.",
      "",
      "</aside>",
    ].join("\n");

    const content = bodyFromMarkdown(notionCopy);
    const blocks = content.content as unknown as Array<{
      type: string;
      attrs: { icon: string; color: string | null };
      textContent?: string;
    }>;
    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.type)).toEqual(["callout", "callout"]);
    expect(blocks.map((block) => block.attrs)).toEqual([
      expect.objectContaining({ icon: "💡", color: null }),
      expect.objectContaining({ icon: "✅", color: null }),
    ]);

    const markdown = bodyToMarkdown(content);
    expect(markdown).toContain(
      '<aside data-type="callout" data-page-callout-icon="💡">'
    );
    expect(markdown).toContain(
      '<aside data-type="callout" data-page-callout-icon="✅">'
    );
    expect(markdown).not.toContain("\n💡\n");
    expect(markdown).not.toContain("\n✅\n");
    expect(markdown).toContain("**Nom retenu : Parmi**");
    expect(markdown).toContain("**Décision de nommage — 30 août 2026**");
  });

  it("imports the HTML clipboard variant with an emoji paragraph", () => {
    const editor = editorWith(
      "<aside><p>✅</p><p>A decision copied from Notion.</p></aside>"
    );
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "callout",
      attrs: { icon: "✅", color: null },
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "A decision copied from Notion." }],
        },
      ],
    });
    editor.destroy();
  });

  it("wraps existing content with the default icon", () => {
    const editor = editorWith("An important note");
    const callout = blockById.get("callout");
    expect(callout).toBeDefined();
    expect(turnBlocksInto(editor, callout!)).toBe(true);

    const node = editor.getJSON().content?.[0];
    expect(node).toMatchObject({
      type: "callout",
      attrs: { icon: "💡", color: null },
      content: [{ type: "paragraph" }],
    });
    expect(editor.getHTML()).toContain('data-page-callout-color="amber"');
    editor.destroy();
  });

  it("uses the block background palette without adding a text mark", () => {
    const editor = editorWith("An important note");
    const callout = blockById.get("callout")!;
    turnBlocksInto(editor, callout);

    expect(activeCalloutColor(editor)).toBeNull();
    expect(setCalloutColor(editor, "violet")).toBe(true);
    expect(activeCalloutColor(editor)).toBe("violet");
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "callout",
      attrs: { color: "violet" },
    });
    expect(JSON.stringify(editor.getJSON())).not.toContain(
      '"pageBackgroundColor"'
    );
    editor.destroy();
  });

  it("preserves its icon, color, and rich nested blocks through Markdown", () => {
    const markdown =
      '<aside data-type="callout" data-page-callout-color="amber" data-page-callout-icon="⚠️">\n\nPay attention.\n\n- First check\n- Second check\n\n</aside>';
    const content = bodyFromMarkdown(markdown);

    expect(content.content?.[0]).toMatchObject({
      type: "callout",
      attrs: { icon: "⚠️", color: "amber" },
      content: [
        { type: "paragraph" },
        { type: "bulletList" },
      ],
    });
    expect(bodyToMarkdown(content)).toBe(markdown);
  });

  it("preserves an intentionally removed icon", () => {
    const markdown =
      '<aside data-type="callout" data-page-callout-color="teal" data-page-callout-icon="">\n\nNo icon\n\n</aside>';
    const content = bodyFromMarkdown(markdown);
    expect(content.content?.[0]?.attrs?.icon).toBe("");
    expect(bodyToMarkdown(content)).toBe(markdown);
  });
});
