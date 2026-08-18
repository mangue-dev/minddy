// @vitest-environment jsdom
//
// The placeholder for empty blocks (MIN-270).
//
// What this file holds, and which no type or reread sees: WHAT
// empty blocks carry a placeholder. `Placeholder` of tiptap, left behind
// default options, only look at the DEPTH 1 node — for an item of
// list or quote line, this is the list or quote, which is not
// a block of text. Half of the empty blocks therefore remained mute, in silence,
// and nothing in the code said that.
//
// The second point held here is the TEXT: a title announces its level, a block
// nested just prompts to write, and only the top level line carries
// the menu invitation “/” — this is the only one where “/” is the right gesture.

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";

import { pageExtensions } from "@/components/pages/page-extensions";
import {
  BlockPlaceholder,
  pagePlaceholder,
} from "@/components/pages/block-placeholder";

/** A translator who returns his key: we pin WHICH key comes out, not his language. */
const t = ((key: string) => key) as never;

/**
 * The placeholders present in the document, cursor placed at `at`.
 *
 * `blur`: we leave the document after placing the cursor. The selection
 * SURVIVES focus, so nothing in the state says we left — this is
 * exactly the case that left a write prompt lit on a
 * document we had just left.
 *
 * The focus event is sent TO HAND: jsdom does not consider a
 * `contenteditable` as focusable and therefore does not emit one on its own, where
 * a browser emits one on each click in the editor.
 */
function placeholders(
  content: string,
  at: "start" | "end",
  { blur = false }: { blur?: boolean } = {}
): string[] {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    content,
    extensions: [
      ...pageExtensions({ headless: true }),
      BlockPlaceholder.configure({ text: pagePlaceholder(t) }),
    ] as never,
  });
  editor.commands.focus(at);
  editor.view.dom.dispatchEvent(new FocusEvent("focus"));
  if (blur) editor.view.dom.dispatchEvent(new FocusEvent("blur"));
  const found = [...element.innerHTML.matchAll(/data-placeholder="([^"]*)"/g)]
    .map((match) => match[1]);
  editor.destroy();
  element.remove();
  return found;
}

describe("placeholder d'un bloc vide", () => {
  it("invites the « / » menu on a top-level line", () => {
    expect(placeholders("<p></p>", "start")).toEqual(["placeholder"]);
    expect(placeholders("<p>texte</p><p></p>", "end")).toEqual(["placeholder"]);
  });

  it("announces its level on an empty heading", () => {
    expect(placeholders("<p>x</p><h1></h1>", "end")).toEqual(["blockHeading1"]);
    expect(placeholders("<p>x</p><h2></h2>", "end")).toEqual(["blockHeading2"]);
    expect(placeholders("<p>x</p><h3></h3>", "end")).toEqual(["blockHeading3"]);
  });

  it("descends into NESTED blocks — tiptap's default omitted them", () => {
    expect(placeholders("<p>x</p><ul><li><p></p></li></ul>", "end")).toEqual([
      "placeholderNested",
    ]);
    expect(
      placeholders("<p>x</p><blockquote><p></p></blockquote>", "end")
    ).toEqual(["placeholderNested"]);
  });

  it("turns off as soon as the document is left", () => {
    // The selection remains on the empty line: only FOCUS changed, and it is
    // the one that decides — a writing prompt has no meaning on a
    // document we have just left.
    expect(placeholders("<p></p>", "start", { blur: true })).toEqual([]);
    expect(placeholders("<p>x</p><h2></h2>", "end", { blur: true })).toEqual([]);
  });

  it("decorates neither a full block nor an empty block without the cursor", () => {
    expect(placeholders("<p>plein</p>", "end")).toEqual([]);
    // Two empty blocks that TOUCH: they share a terminal, and tiptap them
    // both are read (plus their empty ancestors) as soon as the cursor moved
    // between them. Only one, always — the one under the cursor.
    expect(placeholders("<p></p><p></p>", "start")).toHaveLength(1);
    expect(placeholders("<p></p><p></p><p></p>", "end")).toHaveLength(1);
    expect(
      placeholders("<ul><li><p></p></li><li><p></p></li></ul>", "end")
    ).toHaveLength(1);
  });
});
