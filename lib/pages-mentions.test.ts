import { describe, expect, it } from "vitest";

import { newPageMentions, pageBlockTexts, PAGE_BLOCK_ID_ATTRIBUTE } from "./pages-mentions";
import { BLOCK_ID_ATTRIBUTE } from "@/components/pages/blocks/types";
import type { Member } from "./types";

/**
 * MIN-278 — ce qui, dans une page, prévient quelqu'un.
 *
 * Logique pure, donc rien à monter : le document entre, les citations sortent.
 * Ce que ces cas gardent, c'est le DÉBIT autant que la justesse — trois des
 * quatre disent quand il ne faut PAS notifier, et c'est le point du ticket : une
 * page se réenregistre une seconde après chaque frappe.
 */

const CLEMENT = "user-clement";
const BOB = "user-bob";

const members: Member[] = [
  { user_id: CLEMENT, full_name: "Clément" },
  { user_id: BOB, full_name: "Bob" },
] as unknown as Member[];

/** Un document d'un bloc par entrée : « [id, texte] ». */
const doc = (blocks: Array<[string | null, string]>) => ({
  type: "doc",
  content: blocks.map(([blockId, text]) => ({
    type: "paragraph",
    ...(blockId ? { attrs: { [PAGE_BLOCK_ID_ATTRIBUTE]: blockId } } : {}),
    content: [{ type: "text", text }],
  })),
});

describe("l'attribut d'id de bloc", () => {
  // La constante est RECOPIÉE (ce module doit rester montable hors navigateur,
  // et le registre de blocs tire tiptap) : c'est ce test qui tient la copie en
  // phase avec l'original. Sans lui, renommer l'attribut ferait perdre l'ancre
  // de bloc de toutes les notifications, en silence.
  it("est le même que celui du registre de blocs", () => {
    expect(PAGE_BLOCK_ID_ATTRIBUTE).toBe(BLOCK_ID_ATTRIBUTE);
  });
});

describe("pageBlockTexts", () => {
  it("aplatit un nœud de MENTION en « @libellé »", () => {
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
    // Un nœud de mention est ATOMIQUE : sans cette traduction, la mention posée
    // au sélecteur — le cas le plus courant — serait invisible au scanner.
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
  it("notifie une citation NOUVELLE, et lui donne son bloc", () => {
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

  it("ne renotifie PAS à la sauvegarde suivante", () => {
    const before = doc([["b1", "@Clément peux-tu trancher ça"]]);
    // Corriger une virgule dix lignes plus bas ne doit repinger personne : sans
    // ce diff, l'éditeur enregistrant chaque seconde, une page en ferait dix.
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
    // `members` est la liste de ceux qui ONT accès : prévenir quelqu'un d'une
    // page qu'il ne peut pas ouvrir lui apprendrait son existence.
    expect(
      newPageMentions({
        members,
        doc: doc([["b1", "@Camille tu en penses quoi"]]),
        actorId: BOB,
      })
    ).toEqual([]);
  });

  it("garde le PREMIER bloc quand la même personne est citée deux fois", () => {
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
