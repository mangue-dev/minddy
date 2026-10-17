// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";

import { hydrateMentions } from "@/components/markdown-mention";
import { pageExtensions } from "@/components/pages/page-extensions";
import { mentionScanner } from "@/lib/mention-scan";
import type { Member } from "@/lib/types";

const member = {
  user_id: "11111111-1111-4111-8111-111111111111",
  email: "jean@example.com",
  full_name: "Jean Dupont",
  avatar_seed: "seed",
  role: "member",
  can_comment: false,
} as unknown as Member;

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function pillsAfter(text: string, exact: boolean): string[] {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: pageExtensions({ headless: true }),
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
  });
  hydrateMentions(editor, mentionScanner([member]), { exact });
  const labels: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "mention") labels.push(String(node.attrs.mentionLabel));
  });
  return labels;
}

describe("hydrateMentions (MIN-688)", () => {
  it("rebuilds every recognized mention by default", () => {
    expect(pillsAfter("Ask @numo and @Jean Dupont", false)).toHaveLength(2);
  });

  it("keeps a mention as text in exact mode when its label would change the page", () => {
    // A live page sends this rebuild as presentation-only. "numo" matches in
    // any case, so "@numo" would become a pill labeled differently and change
    // what the page says; the member name reads identically and is rebuilt.
    const labels = pillsAfter("Ask @numo and @Jean Dupont", true);
    expect(labels).toEqual(["Jean Dupont"]);
  });
});
