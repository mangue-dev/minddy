// @vitest-environment jsdom
//
// Le passage du CORPS vers le TITRE (components/pages/title-bridge.ts).
//
// Ce qu'aucun type ne voit, et qui est tout le sujet : ⌫ et ↑ sont des touches
// déjà prises. La propriété tenue ici n'est donc pas « la touche appelle le
// crochet » mais « elle ne l'appelle QUE si personne d'autre n'avait à faire » —
// sortir d'une liste, joindre deux blocs, supprimer une sélection passent
// devant. C'est la priorité basse de l'extension qui l'assure, et rien dans le
// fichier ne la rappelle à qui la baisserait par mégarde.
//
// La flèche ↑ n'est testée que par sa moitié PURE (`inFirstBlock`) : l'autre
// moitié est `view.endOfTextblock("up")`, qui mesure des rectangles de rendu et
// n'a pas de réponse sous jsdom.

import { describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { pageExtensions } from "@/components/pages/page-extensions";
import {
  TitleBridge,
  atDocumentStart,
  inFirstBlock,
} from "@/components/pages/title-bridge";

/** Le vrai éditeur d'une page, plus le passage vers le titre — c'est-à-dire
    tout ce qui se dispute ⌫ et ↑. */
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

/** Frapper une touche par le VRAI chemin — le plugin `keymap`, dans son ordre
    de plugins (cf. lib/pages-chrome.test.ts, même raison). */
function press(editor: Editor, key: string): void {
  const event = new KeyboardEvent("keydown", { key });
  editor.view.someProp("handleKeyDown", (handler) => handler(editor.view, event));
}

/** Le nom de chaque nœud de premier niveau, dans l'ordre. */
function topLevel(editor: Editor): string[] {
  const names: string[] = [];
  editor.state.doc.forEach((node) => names.push(node.type.name));
  return names;
}

describe("⌫ au début du document", () => {
  it("remonte au titre au lieu de ne rien faire", () => {
    const leave = vi.fn();
    const editor = makeEditor("<p>Bonjour</p><p>Suite</p>", leave);
    editor.commands.setTextSelection(1);
    press(editor, "Backspace");
    expect(leave).toHaveBeenCalledTimes(1);
    // Et le document n'a pas bougé : on ne quitte le corps que là où ⌫ n'avait
    // rien à supprimer.
    expect(editor.getText()).toContain("Bonjour");
    expect(topLevel(editor)).toEqual(["paragraph", "paragraph"]);
    editor.destroy();
  });

  it("laisse joindre les deux blocs quand on n'est pas au premier", () => {
    const leave = vi.fn();
    const editor = makeEditor("<p>Bonjour</p><p>Suite</p>", leave);
    // Début du SECOND paragraphe.
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

  it("ne se déclenche pas sur une sélection", () => {
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
  it("atDocumentStart : le début du premier bloc, et lui seul", () => {
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
    // Le premier bloc, lui, c'est bien celui-là : ↑ y a donc quelque chose à
    // dire là où ⌫ doit d'abord délister.
    expect(inFirstBlock(editor.state)).toBe(true);
    editor.destroy();
  });

  it("inFirstBlock : vrai partout dans le premier bloc, faux ensuite", () => {
    const leave = vi.fn();
    const editor = makeEditor("<p>Bonjour</p><p>Suite</p>", leave);

    editor.commands.setTextSelection(5);
    expect(inFirstBlock(editor.state)).toBe(true);

    editor.commands.setTextSelection(editor.state.doc.content.size - 2);
    expect(inFirstBlock(editor.state)).toBe(false);
    editor.destroy();
  });
});
