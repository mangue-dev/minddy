import { describe, expect, it } from "vitest";

import { newPageMentions, pageBlockTexts, PAGE_BLOCK_ID_ATTRIBUTE } from "./pages-mentions";
import { BLOCK_ID_ATTRIBUTE } from "@/components/pages/blocks/types";
import type { Member } from "./types";

/**
 * MIN-278 — what, on a page, warns someone.
 *
 * Pure logic, so nothing to edit: the document goes in, the quotes go out.
 * What these cases keep is the THROUGHPUT as well as the correctness — three of
 * four say when NOT to notify, and that's the point of the ticket: a
 * page re-saves one second after each keystroke.
 */

const CLEMENT = "user-clement";
const BOB = "user-bob";

const members: Member[] = [
  { user_id: CLEMENT, full_name: "Clément" },
  { user_id: BOB, full_name: "Bob" },
] as unknown as Member[];

/** A document of one block per entry: “[id, text]”. */
const doc = (blocks: Array<[string | null, string]>) => ({
  type: "doc",
  content: blocks.map(([blockId, text]) => ({
    type: "paragraph",
    ...(blockId ? { attrs: { [PAGE_BLOCK_ID_ATTRIBUTE]: blockId } } : {}),
    content: [{ type: "text", text }],
  })),
});

describe("l'attribut d'id de bloc", () => {
  // The constant is COPIED (this module must remain mountable outside the browser,
  // and the block register draws tiptap): it is this test which holds the copy in
  // phase with the original. Without it, renaming the attribute would lose the anchor
  // block all notifications, silently.
  it("is the same as the block registry's", () => {
    expect(PAGE_BLOCK_ID_ATTRIBUTE).toBe(BLOCK_ID_ATTRIBUTE);
  });
});

describe("pageBlockTexts", () => {
  it("flattens a MENTION node to « @label »", () => {
    const flattened = pageBlockTexts({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "b1" },
          content: [
            { type: "text", text: "à " },
            {
              type: "mention",
              attrs: { mentionType: "member", mentionLabel: "Clément" },
            },
            { type: "text", text: " de trancher" },
          ],
        },
      ],
    });
    // A mention node is ATOMICAL: without this translation, the mention placed
    // to the selector — the most common case — would be invisible to the scanner.
    expect(flattened).toEqual([{ blockId: "b1", text: "à  @Clément  de trancher" }]);
  });

  it("rend `null` pour un bloc sans id, et une liste vide pour un corps vide", () => {
    expect(pageBlockTexts(doc([[null, "sans ancre"]]))).toEqual([
      { blockId: null, text: "sans ancre" },
    ]);
    expect(pageBlockTexts(null)).toEqual([]);
    expect(pageBlockTexts({ type: "doc" })).toEqual([]);
  });
});

describe("newPageMentions", () => {
  it("notifies a NEW mention and gives it its block", () => {
    expect(
      newPageMentions({
        members,
        doc: doc([
          ["b1", "un titre"],
          ["b2", "@Clément peux-tu trancher ça"],
        ]),
        actorId: BOB,
      })
    ).toEqual([{ userId: CLEMENT, blockId: "b2" }]);
  });

  it("does not notify again on the next save", () => {
    const before = doc([["b1", "@Clément peux-tu trancher ça"]]);
    // Correcting a comma ten lines below should not bother anyone: without
    // this diff, the editor recording every second, one page would make ten.
    const after = doc([
      ["b1", "@Clément peux-tu trancher ça ?"],
      ["b2", "une ligne de plus"],
    ]);
    expect(newPageMentions({ members, doc: after, previousDoc: before, actorId: BOB }))
      .toEqual([]);
  });

  it("ne notifie JAMAIS l'auteur de sa propre citation", () => {
    expect(
      newPageMentions({
        members,
        doc: doc([["b1", "note pour @Clément"]]),
        actorId: CLEMENT,
      })
    ).toEqual([]);
  });

  it("ignore un nom qui n'est pas membre du projet", () => {
    // `members` is the list of those who HAVE access: warn someone of a
    // page qu'il ne peut pas ouvrir lui apprendrait son existence.
    expect(
      newPageMentions({
        members,
        doc: doc([["b1", "@Camille tu en penses quoi"]]),
        actorId: BOB,
      })
    ).toEqual([]);
  });

  it("keeps the FIRST block when the same person is mentioned twice", () => {
    expect(
      newPageMentions({
        members,
        doc: doc([
          ["b1", "@Bob et"],
          ["b2", "encore @Bob"],
        ]),
        actorId: CLEMENT,
      })
    ).toEqual([{ userId: BOB, blockId: "b1" }]);
  });

  it("notifie l'arrivant, et lui seul, quand une seconde personne est citée", () => {
    expect(
      newPageMentions({
        members,
        doc: doc([["b1", "@Clément et @Bob"]]),
        previousDoc: doc([["b1", "@Clément"]]),
        actorId: "user-3",
      })
    ).toEqual([{ userId: BOB, blockId: "b1" }]);
  });
});
