// @vitest-environment jsdom
//
// MIN-272 — SUBPAGES seen from the document.
//
// The same information is carried in two places — the `parent_id` column and the
// `subpage` block in the parent's body — and that's where all the pitfalls are.
// This file holds the DOCUMENT side; the base side (remove the block from the body of the
// parent in basket, put it back in the restaurant, do not invent one to
// a page born in the sidebar) is in lib/server/pages.test.ts, above the
// fake PostgREST that already lives there.
//
// What's pinned here, and that no one sees:
//
// - reading is RECURSIVE. A sub-page block placed in a leaflet or a
//    item de liste compte autant qu'un bloc de premier niveau. Ne regarder que
// the first level would leave behind a block pointing towards the void —
// precisely what this ticket exists to prevent;
// - delete the block, BY ANY GESTURE, announces the page. This is the
// destructive behavior of Notion, tenable only because the
// basket exists, and it does not have the right to miss a path;
// - a block MOVE is not a deletion. Going out and coming in
// node in the same transaction must not trash anything;
// - and above all: adopting a merged document (MIN-271) must not announce ANYTHING.
// This is the worst false positive — the merge removes the block when
// the server just removed it, and read it as a gesture of
// the user would trash the page a second time, in a loop.

import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";
import { NodeSelection } from "@tiptap/pm/state";

import { blockExtensions } from "@/components/pages/blocks";
import {
  appendSubpage,
  hasSubpage,
  remapSubpages,
  removeSubpages,
  subpageIdsIn,
} from "@/lib/pages-subpage";
import { selectBlockAt, selectedSubpageId } from "@/components/pages/block-actions";
import type { PageDocJSON } from "@/lib/pages-merge";

const A = "page-a";
const B = "page-b";

const subpage = (pageId: string): JSONContent => ({
  type: "subpage",
  attrs: { pageId },
});
const para = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
const doc = (...content: JSONContent[]) =>
  ({ type: "doc", content }) as JSONContent & PageDocJSON;

/* ─── Reading the document ──────────────────────── ───────────────────────── */

describe("subpageIdsIn", () => {
  it("trouve les blocs IMBRIQUÉS, pas seulement ceux du premier niveau", () => {
    const nested = doc(
      para("intro"),
      subpage(A),
      {
        type: "details",
        content: [
          { type: "detailsSummary" },
          { type: "detailsContent", content: [subpage(B)] },
        ],
      }
    );

    expect(subpageIdsIn(nested)).toEqual([A, B]);
    expect(hasSubpage(nested, B)).toBe(true);
  });

  it("ignore un bloc sans page cible, et ne compte pas deux fois la même", () => {
    // A block without `pageId` is that of a creation which was not successful: it
    // points to nothing, there is nothing to trash.
    const twice = doc(subpage(A), { type: "subpage", attrs: { pageId: null } }, subpage(A));
    expect(subpageIdsIn(twice)).toEqual([A]);
  });

  it("ne trouve rien dans un document vide ou absent", () => {
    expect(subpageIdsIn(null)).toEqual([]);
    expect(subpageIdsIn(doc())).toEqual([]);
  });
});

describe("removeSubpages", () => {
  it("retire le bloc où qu'il soit, y compris sous un dépliant", () => {
    const before = doc(para("intro"), subpage(A), {
      type: "details",
      content: [
        { type: "detailsSummary" },
        { type: "detailsContent", content: [para("x"), subpage(B)] },
      ],
    });

    const { doc: after, removed } = removeSubpages(before, [A, B]);

    expect(removed).toBe(2);
    expect(subpageIdsIn(after)).toEqual([]);
    // The rest of the document does not move: we remove a link, not a chapter.
    expect((after as PageDocJSON).content).toHaveLength(2);
  });

  it("retire les DEUX blocs quand le même parent cite deux fois la page", () => {
    const { removed } = removeSubpages(doc(subpage(A), para("x"), subpage(A)), [A]);
    expect(removed).toBe(2);
  });

  it("rend l'objet d'entrée quand il n'y a rien à retirer", () => {
    // This is what allows the caller to decide if he WRITE: a writing
    // for nothing would increment the version and send everyone into meltdown.
    const before = doc(para("intro"));
    const { doc: after, removed } = removeSubpages(before, [A]);
    expect(removed).toBe(0);
    expect(after).toBe(before);
  });
});

describe("appendSubpage", () => {
  it("remet le bloc en FIN de corps", () => {
    const { doc: after, added } = appendSubpage(doc(para("intro")), A);
    expect(added).toBe(true);
    expect(after.content?.at(-1)).toMatchObject({ type: "subpage", attrs: { pageId: A } });
  });

  it("ne pose rien si le corps cite déjà la page", () => {
    const before = doc(subpage(A));
    const { doc: after, added } = appendSubpage(before, A);
    expect(added).toBe(false);
    expect(after).toBe(before);
  });

  it("part d'un document vide quand le corps est absent", () => {
    const { doc: after } = appendSubpage(null, A);
    expect(subpageIdsIn(after)).toEqual([A]);
  });
});

/* ─── Detection, on a REAL editor ─────────────────────────────── */

/**
 * Editors opened by the file. A `Editor` TipTap mounts a `DOMObserver`
 * from ProseMirror which is rescheduled by `setTimeout`: without `destroy()`, this
 * timer survives the file and wakes up once the `document` from jsdom
 * unmounted — `ReferenceError: document is not defined`, remounted by vitest as
 * an unhandled error from the SUITE, attributed to the file that was running at this
 * moment. It takes enough charge for the timer to miss its window, hence
 * an error that only appeared every other day. This is the file that opens
 * which closes.
 */
const openEditors: Editor[] = [];

afterEach(() => {
  for (const editor of openEditors.splice(0)) editor.destroy();
});

/** The one-page editor, mounted on the real registry, without a line of React. */
function makeEditor(content: JSONContent) {
  const removed = vi.fn<(ids: string[]) => void>();
  const editor = new Editor({
    element: document.createElement("div"),
    content,
    extensions: [Document, Text, ...blockExtensions({ headless: true })] as never,
  });
  editor.storage.subpage.removed = removed;
  openEditors.push(editor);
  return { editor, removed };
}

/** The position of the subpage block that points to `pageId`. */
function posOf(editor: Editor, pageId: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "subpage" && node.attrs.pageId === pageId) found = pos;
    return found === -1;
  });
  if (found === -1) throw new Error(`bloc introuvable pour ${pageId}`);
  return found;
}

function deleteAt(editor: Editor, pos: number) {
  const selection = NodeSelection.create(editor.state.doc, pos);
  editor.view.dispatch(editor.state.tr.setSelection(selection));
  editor.commands.deleteSelection();
}

describe("la disparition d'un bloc sous-page", () => {
  it("annonce la page dont le bloc vient d'être supprimé", () => {
    const { editor, removed } = makeEditor(doc(para("intro"), subpage(A)));

    deleteAt(editor, posOf(editor, A));

    expect(removed).toHaveBeenCalledWith([A]);
  });

  it("annonce toutes les pages d'un coup quand on efface plusieurs blocs", () => {
    // Select all then delete: the path by which we take the
    // more pages without thinking about it, and the one who must announce the correct account.
    const { editor, removed } = makeEditor(doc(subpage(A), para("x"), subpage(B)));

    editor.commands.selectAll();
    editor.commands.deleteSelection();

    expect(removed).toHaveBeenCalledTimes(1);
    expect(removed.mock.calls[0][0].sort()).toEqual([A, B]);
  });

  it("attrape aussi un bloc IMBRIQUÉ dans un dépliant", () => {
    const { editor, removed } = makeEditor(
      doc({
        type: "details",
        content: [
          { type: "detailsSummary" },
          { type: "detailsContent", content: [subpage(A)] },
        ],
      })
    );

    editor.commands.selectAll();
    editor.commands.deleteSelection();

    expect(removed).toHaveBeenCalledWith([A]);
  });

  it("ne dit RIEN d'un bloc simplement DÉPLACÉ", () => {
    // Exiting and reentering the node in the same transaction is what a
    // drag and drop. Reading it as a deletion would trash a page
    // for a layout gesture.
    const { editor, removed } = makeEditor(doc(para("intro"), subpage(A), para("fin")));
    const pos = posOf(editor, A);

    editor
      .chain()
      .deleteRange({ from: pos, to: pos + 1 })
      .insertContentAt(0, subpage(A))
      .run();

    expect(subpageIdsIn(editor.getJSON() as PageDocJSON)).toEqual([A]);
    expect(removed).not.toHaveBeenCalled();
  });

  it("ne dit RIEN quand on ADOPTE un document venu du serveur", () => {
    // The false positive that would cost the most: the MIN-271 merger removes
    // the block because the SERVER has just removed it (the page is already at the
    // trash). Reading it as a user gesture would restart a bet
    // to the trash on a page that is already there — and the confirmation box
    // would open by itself in the middle of reading.
    const { editor, removed } = makeEditor(doc(para("intro"), subpage(A)));

    editor.commands.setContent(doc(para("intro")) as JSONContent, {
      emitUpdate: false,
    });

    expect(subpageIdsIn(editor.getJSON() as PageDocJSON)).toEqual([]);
    expect(removed).not.toHaveBeenCalled();
  });

  it("ne dit rien d'une frappe ordinaire", () => {
    const { editor, removed } = makeEditor(doc(para("intro"), subpage(A)));

    editor.commands.focus("start");
    editor.commands.insertContent("bonjour");

    expect(removed).not.toHaveBeenCalled();
  });
});

describe("remapSubpages", () => {
  it("réécrit les pages citées, y compris sous un dépliant", () => {
    const before = doc(subpage(A), {
      type: "details",
      content: [
        { type: "detailsSummary" },
        { type: "detailsContent", content: [subpage(B)] },
      ],
    });

    const after = remapSubpages(before, new Map([[A, "copie-a"], [B, "copie-b"]]));

    expect(subpageIdsIn(after)).toEqual(["copie-a", "copie-b"]);
  });

  it("ne touche PAS une citation hors de la table", () => {
    // The point that makes the difference between copying a branch and copying the
    // world around: a link to a page that is not copy must
    // continue pointing where he was pointing.
    const after = remapSubpages(doc(subpage(A), subpage(B)), new Map([[A, "copie-a"]]));
    expect(subpageIdsIn(after)).toEqual(["copie-a", B]);
  });

  it("rend le document tel quel quand il n'y a rien à réécrire", () => {
    const before = doc(subpage(A));
    expect(remapSubpages(before, new Map())).toBe(before);
    expect(remapSubpages(null, new Map([[A, "copie-a"]]))).toBeNull();
  });
});

describe("selectedSubpageId", () => {
  it("rend la page quand la sélection est CE bloc, et rien d'autre", () => {
    // This is what switches the menu ⋯ from a block vocabulary to a
    // page vocabulary: duplicate copy page, delete trash.
    const { editor } = makeEditor(doc(para("intro"), subpage(A)));

    expect(selectBlockAt(editor, posOf(editor, A))).toBe(true);
    expect(selectedSubpageId(editor)).toBe(A);
  });

  it("rend null sur un bloc ordinaire", () => {
    const { editor } = makeEditor(doc(para("intro"), subpage(A)));
    editor.commands.focus("start");
    expect(selectedSubpageId(editor)).toBeNull();
  });

  it("rend null dès que la sélection porte sur PLUSIEURS blocs", () => {
    // A mixed selection falls on the ordinary menu: two vocabularies
    // in the same menu, it's a menu that lies about half of what it says
    // propose.
    const { editor } = makeEditor(doc(para("intro"), subpage(A)));
    editor.commands.selectAll();
    expect(selectedSubpageId(editor)).toBeNull();
  });
});
