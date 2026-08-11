// @vitest-environment jsdom
//
// La lecture des titres pour la table des matières flottante.
//
// Ce que ce fichier tient, et qu'aucun type ne voit :
//
//  - un titre VIDE n'entre pas dans la table. On en fabrique un dès qu'on tape
//    « ## » et qu'on s'arrête pour réfléchir : sans ce filtre, une ligne muette
//    apparaît sous le curseur, puis se déplace au fil de la frappe ;
//  - les titres imbriqués (dans un dépliant) comptent. Les sauter ferait une
//    table qui ignore des sections entières sans jamais dire pourquoi ;
//  - `sameHeadings` est ce qui empêche un re-rendu par frappe : la lecture est
//    refaite à chaque `update`, et deux tables identiques doivent se
//    reconnaître comme telles.

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";
import { blockExtensions } from "@/components/pages/blocks";
import { readHeadings, sameHeadings } from "@/lib/pages-toc";

function makeEditor(content: string) {
  return new Editor({
    element: document.createElement("div"),
    content,
    extensions: [Document, Text, ...blockExtensions({ headless: true })] as never,
  });
}

describe("les titres d'une page", () => {
  it("sont lus dans l'ordre, avec leur niveau et leur texte", () => {
    const editor = makeEditor(
      "<h1>Cadrage</h1><p>Du texte</p><h2>Décisions</h2><h3>Détail</h3>"
    );
    expect(
      readHeadings(editor.state.doc).map(({ level, text }) => ({ level, text }))
    ).toEqual([
      { level: 1, text: "Cadrage" },
      { level: 2, text: "Décisions" },
      { level: 3, text: "Détail" },
    ]);
    editor.destroy();
  });

  it("rendent une position qui ancre bien le nœud du titre", () => {
    const editor = makeEditor("<p>Avant</p><h2>Cible</h2>");
    const [entry] = readHeadings(editor.state.doc);
    expect(editor.state.doc.nodeAt(entry.pos)?.type.name).toBe("heading");
    expect(editor.state.doc.nodeAt(entry.pos)?.textContent).toBe("Cible");
    editor.destroy();
  });

  it("ignorent un titre encore vide", () => {
    const editor = makeEditor("<h1>Écrit</h1><h2></h2>");
    expect(readHeadings(editor.state.doc)).toHaveLength(1);
    editor.destroy();
  });

  it("comptent les titres imbriqués dans un dépliant", () => {
    const editor = makeEditor(
      '<div data-type="details"><div data-type="detailsSummary">Replié</div>' +
        '<div data-type="detailsContent"><h2>Dedans</h2></div></div>'
    );
    expect(readHeadings(editor.state.doc).map((entry) => entry.text)).toEqual([
      "Dedans",
    ]);
    editor.destroy();
  });
});

describe("deux lectures successives", () => {
  it("se reconnaissent identiques tant que rien n'a bougé", () => {
    const editor = makeEditor("<h1>Un</h1><h2>Deux</h2>");
    expect(
      sameHeadings(readHeadings(editor.state.doc), readHeadings(editor.state.doc))
    ).toBe(true);
    editor.destroy();
  });

  it("se distinguent dès qu'un titre change de texte", () => {
    const before = makeEditor("<h1>Un</h1>");
    const after = makeEditor("<h1>Une</h1>");
    expect(
      sameHeadings(readHeadings(before.state.doc), readHeadings(after.state.doc))
    ).toBe(false);
    before.destroy();
    after.destroy();
  });

  it("se distinguent dès qu'un titre change de niveau", () => {
    const before = makeEditor("<h1>Un</h1>");
    const after = makeEditor("<h2>Un</h2>");
    expect(
      sameHeadings(readHeadings(before.state.doc), readHeadings(after.state.doc))
    ).toBe(false);
    before.destroy();
    after.destroy();
  });
});
