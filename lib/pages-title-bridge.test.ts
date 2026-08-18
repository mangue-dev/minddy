// @vitest-environment jsdom
//
// The transition from the BODY to the TITLE (components/pages/title-bridge.ts).
//
// What no guy sees, and which is the whole point: ⌫ and ↑ are keys
// already taken. The property held here is therefore not “the key calls the
// hook” but “she ONLY calls him if no one else had to” —
// exit a list, join two blocks, delete a selection pass
// in front. It is the low priority of the extension which ensures this, and nothing in the
// file does not remind anyone who accidentally lowers it.
//
// The ↑ arrow is only tested by its PURE half (`inFirstBlock`): the other
// half is `view.endOfTextblock("up")`, which measures render rectangles and
// has no response under jsdom.

import { describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { pageExtensions } from "@/components/pages/page-extensions";
import {
  TitleBridge,
  atDocumentStart,
  inFirstBlock,
} from "@/components/pages/title-bridge";

/** The actual one-page editor, plus the jump to the title — that is,
 anything that disputes ⌫ and ↑. */
function makeEditor(content: string, onLeaveTop: () => void) {
  return new Editor({
    element: document.createElement("div"),
    content,
    extensions: [
      ...pageExtensions({ headless: true }),
      TitleBridge.configure({ onLeaveTop }),
    ] as never,
  });
}

/** Hit a key via the REAL path — the `keymap` plugin, in its order
 of plugins (see lib/pages-chrome.test.ts, same reason). */
function press(editor: Editor, key: string): void {
  const event = new KeyboardEvent("keydown", { key });
  editor.view.someProp("handleKeyDown", (handler) => handler(editor.view, event));
}

/** The name of each top-level node, in order. */
function topLevel(editor: Editor): string[] {
  const names: string[] = [];
  editor.state.doc.forEach((node) => names.push(node.type.name));
  return names;
}

describe("⌫ at the start of the document", () => {
  it("remonte au titre au lieu de ne rien faire", () => {
    const leave = vi.fn();
    const editor = makeEditor("<p>Bonjour</p><p>Suite</p>", leave);
    editor.commands.setTextSelection(1);
    press(editor, "Backspace");
    expect(leave).toHaveBeenCalledTimes(1);
    // And the document has not moved: we only leave the body where ⌫ had not
    // nothing to delete.
    expect(editor.getText()).toContain("Bonjour");
    expect(topLevel(editor)).toEqual(["paragraph", "paragraph"]);
    editor.destroy();
  });

  it("laisse joindre les deux blocs quand on n'est pas au premier", () => {
    const leave = vi.fn();
    const editor = makeEditor("<p>Bonjour</p><p>Suite</p>", leave);
    // Start of SECOND paragraph.
    editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize + 1);
    press(editor, "Backspace");
    expect(leave).not.toHaveBeenCalled();
    expect(editor.getText()).toBe("BonjourSuite");
    editor.destroy();
  });

  it("sort d'abord de la liste, même en tête de document", () => {
    const leave = vi.fn();
    const editor = makeEditor("<ul><li><p>Item</p></li></ul>", leave);
    editor.commands.setTextSelection(3);
    press(editor, "Backspace");
    expect(leave).not.toHaveBeenCalled();
    expect(topLevel(editor)).not.toContain("bulletList");
    expect(editor.getText()).toContain("Item");
    editor.destroy();
  });

  it("does not trigger on a selection", () => {
    const leave = vi.fn();
    const editor = makeEditor("<p>Bonjour</p>", leave);
    editor.commands.setTextSelection({ from: 1, to: 4 });
    press(editor, "Backspace");
    expect(leave).not.toHaveBeenCalled();
    expect(editor.getText()).toBe("jour");
    editor.destroy();
  });

  it("ne fait rien de plus quand la surface n'a pas de titre", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      content: "<p>Bonjour</p>",
      extensions: [...pageExtensions({ headless: true }), TitleBridge] as never,
    });
    editor.commands.setTextSelection(1);
    press(editor, "Backspace");
    expect(editor.getText()).toBe("Bonjour");
    editor.destroy();
  });
});

describe("les deux gardes, lues seules", () => {
  it("atDocumentStart: the start of the first block, and only it", () => {
    const leave = vi.fn();
    const editor = makeEditor("<p>Bonjour</p><p>Suite</p>", leave);

    editor.commands.setTextSelection(1);
    expect(atDocumentStart(editor.state)).toBe(true);

    editor.commands.setTextSelection(2);
    expect(atDocumentStart(editor.state)).toBe(false);

    editor.commands.setTextSelection(editor.state.doc.content.size - 5);
    expect(atDocumentStart(editor.state)).toBe(false);
    editor.destroy();
  });

  it("atDocumentStart : un item de liste n'est pas le début du document", () => {
    const leave = vi.fn();
    const editor = makeEditor("<ul><li><p>Item</p></li></ul>", leave);
    editor.commands.setTextSelection(3);
    expect(atDocumentStart(editor.state)).toBe(false);
    // The first block is indeed this one: ↑ there is therefore something to
    // say where ⌫ must first delist.
    expect(inFirstBlock(editor.state)).toBe(true);
    editor.destroy();
  });

  it("inFirstBlock: true throughout the first block, false afterward", () => {
    const leave = vi.fn();
    const editor = makeEditor("<p>Bonjour</p><p>Suite</p>", leave);

    editor.commands.setTextSelection(5);
    expect(inFirstBlock(editor.state)).toBe(true);

    editor.commands.setTextSelection(editor.state.doc.content.size - 2);
    expect(inFirstBlock(editor.state)).toBe(false);
    editor.destroy();
  });
});
