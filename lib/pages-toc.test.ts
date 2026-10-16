// @vitest-environment jsdom
//
// Reading titles for the floating table of contents.
//
// What this file holds, and which no type sees:
//
// - an EMPTY title does not enter the table. We make one as soon as we type
// “##” and we stop to think: without this filter, a silent line
// appears under the cursor, then moves as you type;
// - nested titles (in a leaflet) count. Skipping them would make
// table that ignores entire sections without ever saying why;
// - `sameHeadings` is what prevents re-rendering by typing: reading is
// redone at each `update`, and two identical tables must be
// recognize as such.

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";
import UniqueID from "@tiptap/extension-unique-id";
import { blockExtensions } from "@/components/pages/blocks";
import { BLOCK_ID_ATTRIBUTE } from "@/components/pages/blocks/types";
import { readHeadings, sameHeadings } from "@/lib/pages-toc";

function makeEditor(content: string) {
  return new Editor({
    element: document.createElement("div"),
    content,
    extensions: [
      Document,
      Text,
      ...blockExtensions({ headless: true }),
      UniqueID.configure({
        attributeName: BLOCK_ID_ATTRIBUTE,
        types: ["heading"],
      }),
    ] as never,
  });
}

describe("page headings", () => {
  it("are read in order, with their level and text", () => {
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

  it("return a position that anchors the heading node", () => {
    const editor = makeEditor("<p>Avant</p><h2>Cible</h2>");
    const [entry] = readHeadings(editor.state.doc);
    expect(editor.state.doc.nodeAt(entry.pos)?.type.name).toBe("heading");
    expect(editor.state.doc.nodeAt(entry.pos)?.textContent).toBe("Cible");
    editor.destroy();
  });

  it("skip a heading that is still empty", () => {
    const editor = makeEditor("<h1>Écrit</h1><h2></h2>");
    expect(readHeadings(editor.state.doc)).toHaveLength(1);
    editor.destroy();
  });

  it("count headings nested in a toggle block", () => {
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

describe("two successive readings", () => {
  it("are recognized as identical while nothing has changed", () => {
    const editor = makeEditor("<h1>Un</h1><h2>Deux</h2>");
    expect(
      sameHeadings(readHeadings(editor.state.doc), readHeadings(editor.state.doc))
    ).toBe(true);
    editor.destroy();
  });

  it("differ as soon as a heading changes text", () => {
    const before = makeEditor("<h1>Un</h1>");
    const after = makeEditor("<h1>Une</h1>");
    expect(
      sameHeadings(readHeadings(before.state.doc), readHeadings(after.state.doc))
    ).toBe(false);
    before.destroy();
    after.destroy();
  });

  it("differ as soon as a heading changes level", () => {
    const before = makeEditor("<h1>Un</h1>");
    const after = makeEditor("<h2>Un</h2>");
    expect(
      sameHeadings(readHeadings(before.state.doc), readHeadings(after.state.doc))
    ).toBe(false);
    before.destroy();
    after.destroy();
  });

  it("keeps heading identities stable when earlier content moves their positions", async () => {
    const editor = makeEditor("<p>Before</p><h1>One</h1><h2>Two</h2>");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const before = readHeadings(editor.state.doc);

    editor.commands.insertContentAt(1, "Longer ");
    const after = readHeadings(editor.state.doc);

    expect(after.map((entry) => entry.id)).toEqual(
      before.map((entry) => entry.id)
    );
    expect(after.map((entry) => entry.pos)).not.toEqual(
      before.map((entry) => entry.pos)
    );
    // Typing above the headings must not re-render the table.
    expect(sameHeadings(before, after)).toBe(true);
    editor.destroy();
  });
});
