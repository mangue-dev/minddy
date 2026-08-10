// @vitest-environment jsdom
//
// MIN-272 — les SOUS-PAGES vues depuis le document.
//
// La même information est portée à deux endroits — la colonne `parent_id` et le
// bloc `subpage` dans le corps du parent — et c'est là que sont tous les pièges.
// Ce fichier tient le côté DOCUMENT ; le côté base (retirer le bloc du corps du
// parent en corbeillant, le remettre en restaurant, ne pas en inventer un pour
// une page née dans la sidebar) est dans lib/server/pages.test.ts, au-dessus du
// faux PostgREST qui y vit déjà.
//
// Ce qui est épinglé ici, et qu'aucun type ne voit :
//
//  - la lecture est RÉCURSIVE. Un bloc sous-page posé dans un dépliant ou un
//    item de liste compte autant qu'un bloc de premier niveau. Ne regarder que
//    le premier niveau laisserait derrière un bloc pointant vers le vide —
//    précisément ce que ce ticket existe pour empêcher ;
//  - supprimer le bloc, PAR N'IMPORTE QUEL GESTE, annonce la page. C'est le
//    comportement destructeur de Notion, tenable seulement parce que la
//    corbeille existe, et il n'a pas le droit de rater un chemin ;
//  - un DÉPLACEMENT de bloc n'est pas une suppression. Sortir et rentrer le
//    nœud dans la même transaction ne doit rien corbeiller ;
//  - et surtout : adopter un document fusionné (MIN-271) ne doit RIEN annoncer.
//    C'est le pire des faux positifs — la fusion retire justement le bloc quand
//    le serveur vient de le retirer, et le lire comme un geste de
//    l'utilisateur corbeillerait la page une seconde fois, en boucle.

import { describe, expect, it, vi } from "vitest";
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

/* ─── La lecture du document ───────────────────────────────────────────────── */

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
    // Un bloc sans `pageId` est celui d'une création qui n'a pas abouti : il ne
    // pointe vers rien, il n'y a rien à corbeiller.
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
    // Le reste du document ne bouge pas : on retire un lien, pas un chapitre.
    expect((after as PageDocJSON).content).toHaveLength(2);
  });

  it("retire les DEUX blocs quand le même parent cite deux fois la page", () => {
    const { removed } = removeSubpages(doc(subpage(A), para("x"), subpage(A)), [A]);
    expect(removed).toBe(2);
  });

  it("rend l'objet d'entrée quand il n'y a rien à retirer", () => {
    // C'est ce qui permet à l'appelant de décider s'il ÉCRIT : une écriture
    // pour rien incrémenterait la version et enverrait tout le monde en fusion.
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

/* ─── La détection, sur un VRAI éditeur ────────────────────────────────────── */

/** L'éditeur d'une page, monté sur le vrai registre, sans une ligne de React. */
function makeEditor(content: JSONContent) {
  const removed = vi.fn<(ids: string[]) => void>();
  const editor = new Editor({
    element: document.createElement("div"),
    content,
    extensions: [Document, Text, ...blockExtensions({ headless: true })] as never,
  });
  editor.storage.subpage.removed = removed;
  return { editor, removed };
}

/** La position du bloc sous-page qui pointe vers `pageId`. */
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
    // Tout sélectionner puis supprimer : le chemin par lequel on emporte le
    // plus de pages sans y penser, et celui qui doit annoncer le compte juste.
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
    // Sortir et rentrer le nœud dans la même transaction est ce que fait un
    // glisser-déposer. Le lire comme une suppression corbeillerait une page
    // pour un geste de mise en page.
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
    // Le faux positif qui coûterait le plus cher : la fusion de MIN-271 retire
    // le bloc parce que le SERVEUR vient de le retirer (la page est déjà à la
    // corbeille). Le lire comme un geste de l'utilisateur relancerait une mise
    // à la corbeille sur une page qui y est déjà — et la boîte de confirmation
    // s'ouvrirait toute seule au milieu de la lecture.
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
    // Le point qui fait la différence entre copier une branche et copier le
    // monde autour : un lien vers une page qui n'est pas de la copie doit
    // continuer de pointer là où il pointait.
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
    // C'est ce qui fait basculer le menu ⋯ d'un vocabulaire de bloc à un
    // vocabulaire de page : dupliquer copie la page, supprimer la corbeille.
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
    // Une sélection mêlée retombe sur le menu ordinaire : deux vocabulaires
    // dans un même menu, c'est un menu qui ment sur la moitié de ce qu'il
    // propose.
    const { editor } = makeEditor(doc(para("intro"), subpage(A)));
    editor.commands.selectAll();
    expect(selectedSubpageId(editor)).toBeNull();
  });
});
