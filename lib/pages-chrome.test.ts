// @vitest-environment jsdom
//
// The CHROME guardrail of the block (MIN-268).
//
// What this file holds, and which no type sees:
//
// - the menu actions ⋯ operate on a RANGE of blocks, not on a block:
// duplicating a leaflet takes away its contents, delete three blocks
// delete all three. It is the property that decides whether the publisher
// “looks good”, and that’s what a rereading doesn’t see;
// - a duplicated block does NOT copy its identity. Two blocks of the same `blockId`
// would give two identical anchors and one save per block (MIN-271)
// which crushes one by the other — silently;
// - each shortcut declared in the register is well linked, and switches: that of
// active block returns to paragraph. The menu displays the field that the keyboard
// triggers, so the two cannot diverge;
// - the color palette and CSS tokens of app/globals.css say the
// same thing. This is the only link in the repository between a TypeScript file and a
//    feuille de style : rien d'autre ne peut l'attraper.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";
import UniqueID from "@tiptap/extension-unique-id";
import { CATEGORY_COLORS, CATEGORY_COLOR_NAMES } from "@/lib/category-colors";
import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_TYPES,
  PAGE_BLOCKS,
  blockById,
  PAGE_COLORS,
  PAGE_COLOR_ATTRIBUTE,
  PageBlockShortcuts,
  activePageColor,
  blockExtensions,
  pageColorExtensions,
  setPageColor,
  type PageBlockId,
} from "@/components/pages/blocks";
import { BlockFlash, flashBlockAt } from "@/components/pages/block-flash";
import { handleNodeLinkClick } from "@/components/editor-node-link";
import {
  GUTTER_HOVER,
  GUTTER_WIDTH,
  blockLink,
  blockRange,
  styledBox,
  deleteBlocks,
  duplicateBlocks,
  focusDocumentEnd,
  focusDocumentStart,
  insertBlockAround,
  posOfBlockId,
  revealBlock,
  selectBlockAt,
  selectBlockFromHandle,
  selectedBlockCount,
  selectedBlockIds,
  turnBlocksInto,
  withoutBlockIds,
} from "@/components/pages/block-actions";

/** The real one-page editor, minus React: the registry, the colors, the
 shortcuts and stable IDs — that is, everything that chrome
 relies on. */
function makeEditor(content = "") {
  return new Editor({
    element: document.createElement("div"),
    content,
    extensions: [
      Document,
      Text,
      ...blockExtensions({ headless: true }),
      ...pageColorExtensions(),
      PageBlockShortcuts,
      UniqueID.configure({
        attributeName: BLOCK_ID_ATTRIBUTE,
        types: BLOCK_ID_TYPES,
      }),
    ] as never,
  });
}

/**
 * The same editor, once the block IDs are set.
 *
 * `UniqueID` assigns them from the `create` event, which tiptap emits in the NEXT loop
 * — a document read just after `new Editor()` therefore only has
 * from `blockId` to `null`. This isn't a testing quirk: it's also true in the app, and that's why nothing that depends on the identity of a block can be done in mount.
 */
async function makeIdentifiedEditor(content = "") {
  const editor = makeEditor(content);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return editor;
}

/** The name of each top-level node, in order. */
function topLevel(editor: Editor): string[] {
  const names: string[] = [];
  editor.state.doc.forEach((node) => names.push(node.type.name));
  return names;
}

/**
 * Hit a shortcut — via the REAL path, that of the plugin `keymap`.
 *
 * And not `editor.commands.keyboardShortcut()`, which goes through
 * `captureTransaction`: this one holds transactions instead of the
 * apply, so that the publisher state does not move from one transaction to
 * another. A conversion which dispatches several — spread the selection,
 * flatten, convert — is therefore calculated three times on the starting document and
 * raises. In a browser, the keymap calls the link directly and each
 * transaction applies: this is the path we want to measure.
 */
function press(editor: Editor, shortcut: string): void {
  const keys = shortcut.split("-");
  const key = keys[keys.length - 1];
  const event = new KeyboardEvent("keydown", {
    key,
    altKey: keys.includes("Alt"),
    ctrlKey: keys.includes("Ctrl") || keys.includes("Mod"),
    metaKey: keys.includes("Meta"),
    shiftKey: keys.includes("Shift"),
  });
  editor.view.someProp("handleKeyDown", (handler) =>
    handler(editor.view, event)
  );
}

describe("la plage de blocs", () => {
  it("part du bloc entier, pas du curseur", () => {
    const editor = makeEditor("<p>Premier</p><p>Second</p>");
    editor.commands.setTextSelection(3);
    const range = blockRange(editor);
    expect(range).not.toBeNull();
    expect(selectedBlockCount(editor)).toBe(1);
    // The range covers the entire paragraph, not the three characters in front of the
    // cursor: this is what makes “duplicate” duplicate a block.
    expect(range!.to - range!.from).toBe(editor.state.doc.firstChild!.nodeSize);
    editor.destroy();
  });

  it("covers ALL blocks in a selection that crosses several of them", async () => {
    const editor = await makeIdentifiedEditor(
      "<p>Un</p><p>Deux</p><p>Trois</p>"
    );
    editor.commands.setTextSelection({
      from: 2,
      to: editor.state.doc.content.size - 2,
    });
    expect(selectedBlockCount(editor)).toBe(3);
    expect(selectedBlockIds(editor)).toHaveLength(3);
    editor.destroy();
  });

  it("emporte les enfants quand le bloc en a", () => {
    const editor = makeEditor(
      "<ul><li><p>Un</p></li><li><p>Deux</p></li></ul>"
    );
    selectBlockAt(editor, 0);
    const range = blockRange(editor)!;
    // Only one first-level block — the list — but the range covers both
    // items: this is what “the block leaves with its children” means.
    expect(selectedBlockCount(editor)).toBe(1);
    expect(range.to - range.from).toBe(editor.state.doc.firstChild!.nodeSize);
    editor.destroy();
  });
});

describe("dupliquer", () => {
  it("pose la copie juste en dessous, enfants compris", () => {
    const editor = makeEditor(
      "<ul><li><p>Un</p></li><li><p>Deux</p></li></ul><p>Après</p>"
    );
    selectBlockAt(editor, 0);
    expect(duplicateBlocks(editor)).toBe(true);
    expect(topLevel(editor)).toEqual(["bulletList", "bulletList", "paragraph"]);
    const [first, second] = [
      editor.state.doc.child(0),
      editor.state.doc.child(1),
    ];
    expect(second.textContent).toBe(first.textContent);
    expect(second.childCount).toBe(2);
    editor.destroy();
  });

  it("ne recopie PAS l'identité du bloc", async () => {
    const editor = await makeIdentifiedEditor("<p>Un</p>");
    selectBlockAt(editor, 0);
    duplicateBlocks(editor);
    const ids = [
      editor.state.doc.child(0).attrs[BLOCK_ID_ATTRIBUTE],
      editor.state.doc.child(1).attrs[BLOCK_ID_ATTRIBUTE],
    ];
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    expect(ids[1]).not.toBe(ids[0]);
    editor.destroy();
  });

  it("nettoie l'identité en profondeur, pas seulement à la racine", () => {
    const nested = withoutBlockIds([
      {
        type: "bulletList",
        attrs: { [BLOCK_ID_ATTRIBUTE]: "a", other: 1 },
        content: [
          {
            type: "listItem",
            attrs: { [BLOCK_ID_ATTRIBUTE]: "b" },
            content: [],
          },
        ],
      },
    ]);
    expect(nested[0].attrs).toEqual({ other: 1 });
    expect(nested[0].content![0].attrs).toEqual({});
  });
});

describe("supprimer", () => {
  it("carries the entire selection", () => {
    const editor = makeEditor("<p>Un</p><p>Deux</p><p>Trois</p>");
    editor.commands.setTextSelection({ from: 2, to: 8 });
    expect(selectedBlockCount(editor)).toBe(2);
    expect(deleteBlocks(editor)).toBe(true);
    expect(editor.state.doc.textContent).toBe("Trois");
    editor.destroy();
  });
});

describe("le « + » de la marge", () => {
  it("inserts a paragraph and starts the « / » menu in it", () => {
    const editor = makeEditor("<h1>Titre</h1>");
    expect(insertBlockAround(editor, 0, "below")).toBe(true);
    expect(topLevel(editor)).toEqual(["heading", "paragraph"]);
    expect(editor.state.doc.child(1).textContent).toBe("/");
    editor.destroy();
  });

  it("inserts above when asked", () => {
    const editor = makeEditor("<h1>Titre</h1>");
    insertBlockAround(editor, 0, "above");
    expect(topLevel(editor)).toEqual(["paragraph", "heading"]);
    editor.destroy();
  });
});

describe("the clickable bottom reserve", () => {
  it("ajoute un paragraphe et y met le curseur", () => {
    const editor = makeEditor("<h1>Titre</h1>");
    focusDocumentEnd(editor);
    expect(topLevel(editor)).toEqual(["heading", "paragraph"]);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    editor.destroy();
  });

  it("n'en empile pas quand la fin du document en porte déjà un vide", () => {
    const editor = makeEditor("<h1>Titre</h1><p></p>");
    focusDocumentEnd(editor);
    focusDocumentEnd(editor);
    // Two clicks in the reserve, a single paragraph: the void under the text
    // is from the layout, it must not start from the base.
    expect(topLevel(editor)).toEqual(["heading", "paragraph"]);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    editor.destroy();
  });

  it("writes NEXT to the last block without touching it", () => {
    const editor = makeEditor("<p>Un</p><blockquote><p>Deux</p></blockquote>");
    focusDocumentEnd(editor);
    expect(topLevel(editor)).toEqual(["paragraph", "blockquote", "paragraph"]);
    expect(editor.state.doc.child(1).textContent).toBe("Deux");
    editor.destroy();
  });
});

describe("Enter at the end of the title", () => {
  it("opens an empty line at the start of the body with the cursor in it", () => {
    const editor = makeEditor("<p>Déjà écrit</p>");
    focusDocumentStart(editor);
    expect(topLevel(editor)).toEqual(["paragraph", "paragraph"]);
    // The OPEN line is the first, and it is empty: the text already written
    // goes down a notch, like when you open a line anywhere else.
    expect(editor.state.doc.child(0).content.size).toBe(0);
    expect(editor.state.doc.child(1).textContent).toBe("Déjà écrit");
    expect(editor.state.selection.$from.parent.content.size).toBe(0);
    editor.destroy();
  });

  it("n'en empile pas quand le corps commence déjà par une ligne vide", () => {
    const editor = makeEditor("<p></p><p>Déjà écrit</p>");
    focusDocumentStart(editor);
    focusDocumentStart(editor);
    expect(topLevel(editor)).toEqual(["paragraph", "paragraph"]);
    expect(editor.state.selection.$from.parent.content.size).toBe(0);
    editor.destroy();
  });
});

describe("le clignement d'un bloc", () => {
  /** The real editor, WITH the blink extension — that's what we're testing. */
  function flashEditor(content: string) {
    return new Editor({
      element: document.createElement("div"),
      content,
      extensions: [
        Document,
        Text,
        ...blockExtensions({ headless: true }),
        UniqueID.configure({
          attributeName: BLOCK_ID_ATTRIBUTE,
          types: BLOCK_ID_TYPES,
        }),
        BlockFlash,
      ] as never,
    });
  }

  const domAt = (editor: Editor, pos: number) =>
    editor.view.nodeDOM(pos) as HTMLElement;

  it("uses a DECORATION, so the class is in the rendered document", () => {
    const editor = flashEditor("<p>Avant</p><h2>Cible</h2>");
    const pos = 7;
    expect(editor.state.doc.nodeAt(pos)?.type.name).toBe("heading");

    flashBlockAt(editor, pos);
    expect(domAt(editor, pos).classList.contains("page-block-target")).toBe(true);
    editor.destroy();
  });

  it("SURVIVES a node re-render — unlike a manually added class", () => {
    const editor = flashEditor("<p>Avant</p><h2>Cible</h2>");
    const pos = 7;

    // The default we keep: ProseMirror monitors the DOM of its editable area
    // and UNDOES everything he didn't write. A class posed by
    // `classList.add` landed on an element that PM replaced in the
    // stride — measured in the browser, on the real editor. Here we force it
    // re-rendered by the shortest path: we change the document.
    flashBlockAt(editor, pos);
    editor.commands.insertContentAt(1, "x");

    const node = editor.state.doc.nodeAt(pos + 1);
    expect(node?.type.name).toBe("heading");
    // The decoration FOLLOWED its knot, which moved a notch.
    expect(domAt(editor, pos + 1).classList.contains("page-block-target")).toBe(
      true
    );
    editor.destroy();
  });

  it("n'écrit rien dans le document ni dans l'historique", () => {
    const editor = flashEditor("<p>Avant</p><h2>Cible</h2>");
    const before = JSON.stringify(editor.getJSON());
    let updates = 0;
    editor.on("update", () => (updates += 1));

    flashBlockAt(editor, 7);

    // A blink that would enter the document would go to the base and
    // would appear in the markdown that the agent reads.
    expect(JSON.stringify(editor.getJSON())).toBe(before);
    expect(updates).toBe(0);
    editor.destroy();
  });

  it("s'éteint tout seul, et s'annule", () => {
    // The editor is mounted BEFORE freezing time: tiptap defers a part
    // of its assembly, and a false timer would leave it half-built.
    const editor = flashEditor("<p>Avant</p><h2>Cible</h2>");
    const pos = 7;
    const lit = () =>
      domAt(editor, pos).classList.contains("page-block-target");
    vi.useFakeTimers();
    try {
      flashBlockAt(editor, pos);
      expect(lit()).toBe(true);
      vi.advanceTimersByTime(1_000);
      expect(lit()).toBe(true);
      vi.advanceTimersByTime(1_000);
      expect(lit()).toBe(false);

      // And cancel, which prevents the timer of one click from turning off the next.
      const cancel = flashBlockAt(editor, pos);
      cancel();
      expect(lit()).toBe(false);
    } finally {
      vi.useRealTimers();
      editor.destroy();
    }
  });

  it("finds a block by its identity for a link anchor", async () => {
    const editor = await makeIdentifiedEditor("<p>Un</p><p>Deux</p>");
    const id = editor.state.doc.child(1).attrs[BLOCK_ID_ATTRIBUTE] as string;
    expect(posOfBlockId(editor, id)).toBe(editor.state.doc.child(0).nodeSize);
    expect(posOfBlockId(editor, "inconnu")).toBeNull();
    editor.destroy();
  });
});

describe("bringing a block into view", () => {
  it("saute SEC, et c'est ce qui rend le clignement visible", () => {
    vi.useFakeTimers();
    const editor = new Editor({
      element: document.createElement("div"),
      content: "<p>Avant</p><h2>Cible</h2>",
      extensions: [Document, Text, ...blockExtensions({ headless: true }), BlockFlash] as never,
    });
    const pos = 7;
    const container = document.createElement("div");
    container.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
    (editor.view.nodeDOM(pos) as HTMLElement).getBoundingClientRect = () =>
      ({ top: 2_000 }) as DOMRect;
    const calls: ScrollToOptions[] = [];
    container.scrollBy = ((options: ScrollToOptions) => {
      calls.push(options);
    }) as HTMLElement["scrollBy"];

    revealBlock(editor, container, pos, 24);

    // In GENTLE scrolling, `scrollBy` returns control immediately and the page puts
    // up to one second to arrive — but a CSS animation is running so that we can see it
    // or not. The blink was burning up its time during the ride and was no longer
    // there on arrival: visible on a nearby block, invisible on a far block.
    expect(calls).toHaveLength(1);
    expect(calls[0].behavior).toBe("auto");
    // 2000 - 100 - 24: the block is placed 24 px below the top edge, and not pasted
    // below, where the breadcrumbs and save state would hide it.
    expect(calls[0].top).toBe(1_876);
    expect(
      (editor.view.nodeDOM(pos) as HTMLElement).classList.contains(
        "page-block-target"
      )
    ).toBe(true);
    vi.useRealTimers();
    editor.destroy();
  });
});

describe("la teinte du clignement", () => {
  it("n'est PAS l'encre du produit", () => {
    // The safeguard of a regression already committed: `--primary` is the INK of
    // minddy — presque noire en clair, presque blanche en sombre. Un fond
    // diluted ink is a pale gray that does not fade, and the
    // blinking then designated nothing at all. It needs a shade
    // attention, taken from the block color register.
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const rule = css.slice(
      css.indexOf("@keyframes page-block-pulse"),
      css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf("@keyframes page-block-pulse"))
    );
    // The hue comes from the block color register, whatever it is —
    // what is locked here is that it is NOT the ink.
    expect(rule).toMatch(/--page-color-[a-z]+/);
    expect(rule).not.toContain("--primary");
  });

  it("keeps the background under « reduce animations » instead of disappearing", () => {
    // The other half of the same regression: an animation reduced to nothing is
    // an invisible animation. Without beating, the bottom must STAY — this is the
    // `flashBlock` timer that removes it, not the duration of the animation.
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const start = css.indexOf(".page-block-target {");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)", start));
    const block = reduced.slice(0, reduced.indexOf("}", reduced.indexOf("}") + 1));
    expect(block).toContain("animation: none");
    expect(block).toContain("background-color");
    expect(block).not.toContain("animation-duration");
  });
});

describe("le lien d'un bloc", () => {
  it("is the page URL plus the anchor and replaces the existing anchor", () => {
    expect(blockLink("https://minddy.app/p/42", "abc")).toBe(
      "https://minddy.app/p/42#abc"
    );
    expect(blockLink("https://minddy.app/p/42#old", "abc")).toBe(
      "https://minddy.app/p/42#abc"
    );
  });

  it("targets a block with a real identity", async () => {
    const editor = await makeIdentifiedEditor("<p>Un</p>");
    selectBlockAt(editor, 0);
    expect(selectedBlockIds(editor)).toHaveLength(1);
    editor.destroy();
  });
});

describe("les couleurs", () => {
  it("set a palette NAME, never a color", () => {
    const editor = makeEditor("<p>Un texte</p>");
    editor.commands.setTextSelection({ from: 1, to: 3 });
    expect(setPageColor(editor, "text", "red")).toBe(true);
    expect(editor.getHTML()).toContain(`${PAGE_COLOR_ATTRIBUTE.text}="red"`);
    expect(editor.getHTML()).not.toMatch(/#[0-9a-f]{6}/i);
    editor.destroy();
  });

  it("text and background are two marks: setting one does not erase the other", () => {
    const editor = makeEditor("<p>Un texte</p>");
    editor.commands.setTextSelection({ from: 1, to: 3 });
    setPageColor(editor, "text", "red");
    setPageColor(editor, "background", "blue");
    editor.commands.setTextSelection({ from: 1, to: 3 });
    expect(activePageColor(editor, "text")).toBe("red");
    expect(activePageColor(editor, "background")).toBe("blue");
    editor.destroy();
  });

  it("se retirent", () => {
    const editor = makeEditor("<p>Un texte</p>");
    editor.commands.setTextSelection({ from: 1, to: 3 });
    setPageColor(editor, "text", "red");
    setPageColor(editor, "text", null);
    editor.commands.setTextSelection({ from: 1, to: 3 });
    expect(activePageColor(editor, "text")).toBeNull();
    editor.destroy();
  });

  it("cover an ENTIRE multi-block selection in one call", () => {
    const editor = makeEditor("<p>Un</p><p>Deux</p>");
    editor.commands.setTextSelection({ from: 1, to: 8 });
    setPageColor(editor, "text", "green");
    const html = editor.getHTML();
    expect(html.match(/data-page-text="green"/g)).toHaveLength(2);
    editor.destroy();
  });
});

describe("la palette et ses jetons CSS", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

  it("is the product's, not a second palette", () => {
    expect([...PAGE_COLORS]).toEqual(
      CATEGORY_COLORS.map((hex) => CATEGORY_COLOR_NAMES[hex])
    );
  });

  it("has each color's source hue and its two rules", () => {
    for (const hex of CATEGORY_COLORS) {
      const name = CATEGORY_COLOR_NAMES[hex];
      // The source color EXACTLY copies the hex of lib/category-colors.ts —
      // this is the only place where the two meet.
      expect(css, `--page-ink-${name} manque ou diverge de ${hex}`).toContain(
        `--page-ink-${name}: ${hex};`
      );
      expect(css, `--page-color-${name} n'est pas défini`).toContain(
        `--page-color-${name}:`
      );
      expect(css, `pas de règle de texte pour ${name}`).toContain(
        `[data-page-text="${name}"]`
      );
      expect(css, `pas de règle de fond pour ${name}`).toContain(
        `[data-page-back="${name}"]`
      );
    }
  });

  it("gives the dark theme its own value for each one", () => {
    const dark = css.slice(
      css.indexOf(".dark {", css.indexOf("--page-ink-red"))
    );
    for (const name of PAGE_COLORS) {
      expect(dark, `${name} n'a pas de valeur en thème sombre`).toContain(
        `--page-color-${name}:`
      );
    }
  });
});

/**
 * The gutter hovers over ITSELF.
 *
 * The handle extension only listens to the `mousemove` of the ProseMirror view:
 * outside of this box, nothing happens, and the strip is empty to the left of the text —
 * the one where we go to look for the handle — was dead. The repair
 * is a style rule: left padding extends the view box
 * below the gutter, and an exactly opposite negative margin puts the text back where
 * it was.
 *
 * Three values must match, and no type looks at them: the RESERVE
 * that the column leaves on the left (`md:pl-24`), the padding of the rule, and
 * the negative margin which cancels it. An imbalance of one pixel between the last two
 * shifts the body under its title. A padding narrower than the
 * reserve leaves a dead band at the left edge — this is the defect measured in
 * browser on the first version: the handle came out when you stopped
 * at 25 px from the text, and not when you stopped at 70 px, that is to say not when
 * we aimed at the gutter. LARGER padding would remove the box
 * from the column.
 */
describe("the gutter hover surface", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const rule = css.slice(
    css.indexOf(".page-editor[data-gutter] .ProseMirror {"),
    css.indexOf("}", css.indexOf(".page-editor[data-gutter] .ProseMirror {"))
  );

  it("covers the ENTIRE column reserve, not only the buttons", () => {
    expect(rule, "la règle a disparu de app/globals.css").toContain(
      "padding-left"
    );
    expect(rule).toContain(`padding-left: ${GUTTER_HOVER}px;`);
    // The safeguard of the original defect, said in one line: the flyover strip
    // is wider than the buttons, it doesn't stop at them.
    expect(GUTTER_HOVER).toBeGreaterThan(GUTTER_WIDTH);
  });

  it("does not move the text: the margin cancels the padding", () => {
    expect(rule).toContain(`margin-left: -${GUTTER_HOVER}px;`);
  });

  it("equals exactly the reserve given by the document column", () => {
    // `md:pl-24` = 6rem = 96 px. It is the column that decides the width of
    // the gutter; the style rule only copies it. If one of the
    // two moves without the other, either the box comes out of the column, or it
    // remains a dead band — both are invisible on replay.
    const view = readFileSync(
      join(process.cwd(), "components/pages/page-view.tsx"),
      "utf8"
    );
    const rem = GUTTER_HOVER / 16;
    expect(view, `la colonne n'a plus md:pl-${rem * 4}`).toContain(
      `md:pl-${rem * 4}`
    );
  });

  it("n'est pas allumée là où il n'y a pas de gouttière", () => {
    // The rule is conditional on `[data-gutter]`, which page-editor.tsx does not set
    // that in edition: a public page or an impression has no reservation
    // left, and the negative margin there would move the text out of its column.
    const editor = readFileSync(
      join(process.cwd(), "components/pages/page-editor.tsx"),
      "utf8"
    );
    expect(editor).toContain("data-gutter={editor && editable");
  });

  it("gives the buttons their own narrower width", () => {
    const gutter = readFileSync(
      join(process.cwd(), "components/pages/block-gutter.tsx"),
      "utf8"
    );
    expect(gutter).toContain("style={{ width: GUTTER_WIDTH }}");
  });
});

/**
 * “Transform into” on a RANGE (MIN-274 bis).
 *
 * The original default: a list of three items, converted from the handle,
 * appeared as a numbered list of ONE item followed by two bare paragraphs. The
 * handle places a `NodeSelection` on the entire block, which the tiptap list commands cannot read — they fall back on a generic
 * path which only catches the first block. Nothing indicates this: the conversion
 * "succeeds", and it is the document which is false.
 *
 * These cases are written in NUMBER of items on purpose: this is what the eye sees on
 * the screen, and this is exactly what was missing.
 */
describe("« transformer en »", () => {
  const LIST =
    "<ul><li><p>Un</p></li><li><p>Deux</p></li><li><p>Trois</p></li></ul>";
  const turn = (editor: Editor, id: PageBlockId) =>
    turnBlocksInto(editor, blockById.get(id)!);

  /** The name of each first level block, with its number of children. */
  function outline(editor: Editor): string[] {
    const out: string[] = [];
    editor.state.doc.forEach((node) =>
      out.push(`${node.type.name}:${node.childCount}`)
    );
    return out;
  }

  it("converts the ENTIRE list, not its first item", () => {
    const editor = makeEditor(LIST);
    // Exactly what clicking the handle does.
    selectBlockAt(editor, 0);
    turn(editor, "orderedList");
    expect(outline(editor)).toEqual(["orderedList:3"]);
    editor.destroy();
  });

  it("donne un bloc par item quand la cible n'est pas une liste", () => {
    const editor = makeEditor(LIST);
    selectBlockAt(editor, 0);
    turn(editor, "heading2");
    expect(outline(editor)).toEqual(["heading:1", "heading:1", "heading:1"]);
    editor.destroy();
  });

  it("UNLISTS — that is the meaning « transform into » did not have", () => {
    // `setParagraph` and `toggleBlockquote` do not remove items from their
    // list: the two menu entries therefore literally did nothing.
    const toParagraphs = makeEditor(LIST);
    selectBlockAt(toParagraphs, 0);
    turn(toParagraphs, "paragraph");
    expect(outline(toParagraphs)).toEqual([
      "paragraph:1",
      "paragraph:1",
      "paragraph:1",
    ]);
    toParagraphs.destroy();

    const toQuote = makeEditor(LIST);
    selectBlockAt(toQuote, 0);
    turn(toQuote, "quote");
    expect(outline(toQuote)).toEqual(["blockquote:3"]);
    toQuote.destroy();
  });

  it("gathers a MIXED selection into a single list", () => {
    const editor = makeEditor(
      "<p>Un</p><ul><li><p>Deux</p></li><li><p>Trois</p></li></ul>"
    );
    editor.commands.setTextSelection({
      from: 1,
      to: editor.state.doc.content.size - 2,
    });
    expect(selectedBlockCount(editor)).toBe(2);
    turn(editor, "orderedList");
    // A paragraph and two items make three items — not an item and a list
    // orpheline.
    expect(outline(editor)).toEqual(["orderedList:3"]);
    editor.destroy();
  });

  it("sort le contenu d'un dépliant au lieu de le laisser dedans", () => {
    const editor = makeEditor(
      "<div data-type='details'><div data-type='detailsSummary'>Résumé</div><div data-type='detailsContent'><p>Corps</p></div></div>"
    );
    selectBlockAt(editor, 0);
    turn(editor, "paragraph");
    expect(outline(editor)).toEqual(["paragraph:1", "paragraph:1"]);
    editor.destroy();
  });

  it("does not move when the already active block is requested again", () => {
    const editor = makeEditor(LIST);
    selectBlockAt(editor, 0);
    turn(editor, "bulletList");
    expect(outline(editor)).toEqual(["bulletList:3"]);
    editor.destroy();
  });
});

/**
 * The multi-block selection, and what erased it (MIN-274 bis).
 *
 * The gesture existed — sweeping several blocks with the mouse, the menu ⋯ announces
 * “3 blocks” and acts on all three. What was missing was the last
 * centimeter: going FIND the handle brought the selection back to the single block
 * it hovered over, so the selection never survived to the menu.
 */
describe("the handle facing an existing selection", () => {
  it("keeps a multi-block selection containing the hovered block", () => {
    const editor = makeEditor("<p>Un</p><p>Deux</p><p>Trois</p>");
    editor.commands.setTextSelection({ from: 1, to: 14 });
    expect(selectedBlockCount(editor)).toBe(3);

    // The handle of the SECOND block — in the middle of the selection.
    const second = editor.state.doc.firstChild!.nodeSize;
    expect(selectBlockFromHandle(editor, second, false)).toBe(true);
    expect(selectedBlockCount(editor)).toBe(3);
    editor.destroy();
  });

  it("repart d'un seul bloc quand on vise HORS de la sélection", () => {
    const editor = makeEditor("<p>Un</p><p>Deux</p><p>Trois</p>");
    const first = editor.state.doc.firstChild!.nodeSize;
    editor.commands.setTextSelection({ from: 1, to: 8 });
    expect(selectedBlockCount(editor)).toBe(2);

    const third = first + editor.state.doc.child(1).nodeSize;
    expect(selectBlockFromHandle(editor, third, false)).toBe(true);
    expect(selectedBlockCount(editor)).toBe(1);
    editor.destroy();
  });

  it("keeps nothing when a single block was selected", () => {
    const editor = makeEditor("<p>Un</p><p>Deux</p>");
    selectBlockAt(editor, 0);
    const second = editor.state.doc.firstChild!.nodeSize;
    selectBlockFromHandle(editor, second, false);
    expect(selectedBlockCount(editor)).toBe(1);
    expect(blockRange(editor)!.from).toBe(second);
    editor.destroy();
  });

  it("⇧-click extends to the targeted block", () => {
    const editor = makeEditor("<p>Un</p><p>Deux</p><p>Trois</p>");
    selectBlockAt(editor, 0);
    const third =
      editor.state.doc.firstChild!.nodeSize +
      editor.state.doc.child(1).nodeSize;
    expect(selectBlockFromHandle(editor, third, true)).toBe(true);
    expect(selectedBlockCount(editor)).toBe(3);
    editor.destroy();
  });
});

describe("les raccourcis de conversion", () => {
  it("are declared in the registry, not in chrome", () => {
    // The blocks which carry a shortcut are exactly those which are converted
    // on the fly while writing. A shortcut on a non-convertible block does not
    // pourrait rien faire.
    for (const block of PAGE_BLOCKS) {
      if (!block.shortcut) continue;
      expect(
        block.turnInto,
        `« ${block.id} » a un raccourci sans conversion`
      ).toBeTruthy();
      expect(block.shortcut.keys).toMatch(/^(Mod|Shift|Alt)-/);
      expect(block.shortcut.display.length).toBeGreaterThan(0);
    }
  });

  it("n'ont pas deux blocs sur la même combinaison", () => {
    const seen = new Map<string, string>();
    for (const block of PAGE_BLOCKS) {
      if (!block.shortcut) continue;
      expect(
        seen.get(block.shortcut.keys),
        block.shortcut.keys
      ).toBeUndefined();
      seen.set(block.shortcut.keys, block.id);
    }
    // Those of the notebook and tiptap extensions, identically: one user
    // going from a note to a page does not relearn anything.
    expect(seen.get("Mod-Alt-1")).toBe("heading1");
    expect(seen.get("Mod-Shift-8")).toBe("bulletList");
    expect(seen.get("Mod-Shift-9")).toBe("taskList");
  });

  it("are actually linked and toggle", () => {
    const editor = makeEditor("<p>Un texte</p>");
    editor.commands.setTextSelection(2);

    // The register mounts the link: ⌘⌥2 converts…
    expect(editor.commands.keyboardShortcut("Mod-Alt-2")).toBe(true);
    expect(editor.state.doc.firstChild!.type.name).toBe("heading");
    expect(editor.state.doc.firstChild!.attrs.level).toBe(2);

    // …and the same combination leads back to the paragraph. Without this switch
    // uniform, `⌘⌥1` would switch (Heading) and `⌘⌥D` not (Details).
    expect(editor.commands.keyboardShortcut("Mod-Alt-2")).toBe(true);
    expect(editor.state.doc.firstChild!.type.name).toBe("paragraph");
    editor.destroy();
  });

  it("convert the entire list, like the ⋯ menu", () => {
    // Same default, different door: the shortcut reads the same selection as the
    // menu, so it had to gain the same fix.
    const editor = makeEditor(
      "<ul><li><p>Un</p></li><li><p>Deux</p></li><li><p>Trois</p></li></ul>"
    );
    selectBlockAt(editor, 0);
    press(editor, "Mod-Shift-9");
    expect(topLevel(editor)).toEqual(["taskList"]);
    expect(editor.state.doc.firstChild!.childCount).toBe(3);
    editor.destroy();
  });

  it("also apply to a selection of several blocks", () => {
    const editor = makeEditor("<p>Un</p><p>Deux</p>");
    editor.commands.setTextSelection({ from: 1, to: 8 });
    editor.commands.keyboardShortcut("Mod-Alt-3");
    expect(topLevel(editor)).toEqual(["heading", "heading"]);
    editor.destroy();
  });
});

/**
 * The two DOM traps of REACT node views (MIN-272).
 *
 * They are similar: in both cases, the editor treats an element produced
 * by tiptap-react as if it came from the document, and gets the wrong target.
 */
describe("le DOM d'une vue de nœud", () => {
  it("mesure l'élément qui porte le style, pas le conteneur de tiptap-react", () => {
    // `view.nodeDOM` returns a NUDE `div.react-renderer`: all the style of the block —
    // its padding, its line height — lives in the `NodeViewWrapper`
    // that it contains. Measuring the container is like measuring nothing, and the
    // gutter floated above the text of exactly the `py-` of the block.
    const container = document.createElement("div");
    container.className = "react-renderer";
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-node-view-wrapper", "");
    container.append(wrapper);

    expect(styledBox(container)).toBe(wrapper);

    // Un bloc ordinaire (un paragraphe rendu par ProseMirror) se mesure tel quel.
    const paragraph = document.createElement("p");
    paragraph.append(document.createTextNode("texte"));
    expect(styledBox(paragraph)).toBe(paragraph);

    // An empty container has nothing to go down to: we do not return `null`.
    const empty = document.createElement("div");
    empty.className = "react-renderer";
    expect(styledBox(empty)).toBe(empty);
  });

  it("garde le clic d'une ancre de vue de nœud hors de l'extension Link", () => {
    // The extension catches ALL `<a>` of the document and does `window.open`: on the
    // sub-page block like on the pill of a mention, one click gave two
    // navigations — a new tab, and the anchor followed in the current tab.
    const link = document.createElement("a");
    link.className = "editor-node-link";
    const inner = document.createElement("span");
    link.append(inner);
    document.body.append(link);

    const plain = new MouseEvent("click", { cancelable: true });
    inner.dispatchEvent(plain);
    expect(handleNodeLinkClick(plain)).toBe(true);
    expect(plain.defaultPrevented).toBe(true);

    // ⌘-click: we cut the extension, but we let the browser open its
    // tab — he does it better than us.
    const meta = new MouseEvent("click", { cancelable: true, metaKey: true });
    inner.dispatchEvent(meta);
    expect(handleNodeLinkClick(meta)).toBe(true);
    expect(meta.defaultPrevented).toBe(false);

    // A TEXT link does not concern us: the extension keeps control.
    const other = document.createElement("a");
    document.body.append(other);
    const textLink = new MouseEvent("click", { cancelable: true });
    other.dispatchEvent(textLink);
    expect(handleNodeLinkClick(textLink)).toBe(false);
    expect(textLink.defaultPrevented).toBe(false);

    link.remove();
    other.remove();
  });
});
