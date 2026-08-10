import { describe, expect, it } from "vitest";

import {
  applyRestore,
  mergeDocs,
  type PageDocJSON,
  type PageNodeJSON,
} from "./pages-merge";

/**
 * MIN-271 — la fusion par bloc, et ce qu'elle refuse de trancher.
 *
 * Le contrat tient en deux phrases : ce qu'un seul des deux a touché est repris
 * sans rien dire ; ce que les deux ont touché garde la version DISTANTE et
 * ressort dans `conflicts`. Tout le reste de ce fichier n'est que la liste des
 * façons dont deux personnes peuvent se croiser sur un document — modifier
 * ailleurs, modifier au même endroit, supprimer ce que l'autre écrit,
 * réordonner pendant que l'autre écrit.
 */

/** Un paragraphe identifié, écrit court : c'est le texte qui varie. */
function p(id: string, text: string): PageNodeJSON {
  return {
    type: "paragraph",
    attrs: { blockId: id },
    content: [{ type: "text", text }],
  };
}

function doc(...blocks: PageNodeJSON[]): PageDocJSON {
  return { type: "doc", content: blocks };
}

/** Le texte de chaque bloc, dans l'ordre — ce qu'un lecteur verrait. */
function read(document: PageDocJSON): string[] {
  return (document.content ?? []).map((node) => {
    const first = node.content?.[0] as { text?: string } | undefined;
    return `${node.attrs?.blockId as string}:${first?.text ?? ""}`;
  });
}

describe("mergeDocs", () => {
  it("fusionne en silence deux modifications sur des blocs différents", () => {
    const base = doc(p("a", "A"), p("b", "B"), p("c", "C"));
    const mine = doc(p("a", "A"), p("b", "B modifié"), p("c", "C"));
    const theirs = doc(p("a", "A"), p("b", "B"), p("c", "C modifié"));

    const result = mergeDocs(base, mine, theirs);

    expect(result.conflicts).toEqual([]);
    expect(read(result.doc)).toEqual(["a:A", "b:B modifié", "c:C modifié"]);
    // Le résultat n'est pas ce que le serveur porte : il faut le lui rendre.
    expect(result.changed).toBe(true);
  });

  it("signale le bloc que les deux ont touché, et garde la version distante", () => {
    const base = doc(p("a", "A"), p("b", "B"));
    const mine = doc(p("a", "A"), p("b", "chez moi"));
    const theirs = doc(p("a", "A"), p("b", "chez l'autre"));

    const result = mergeDocs(base, mine, theirs);

    expect(read(result.doc)).toEqual(["a:A", "b:chez l'autre"]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].id).toBe("b");
    expect(result.conflicts[0].mine).toEqual(p("b", "chez moi"));
    // Rien à rejouer : le document fusionné est celui du serveur.
    expect(result.changed).toBe(false);
  });

  it("n'invente pas de conflit quand les deux ont écrit la MÊME chose", () => {
    const base = doc(p("a", "A"));
    const same = doc(p("a", "A bis"));

    const result = mergeDocs(base, same, structuredClone(same));

    expect(result.conflicts).toEqual([]);
    expect(result.changed).toBe(false);
  });

  it("garde mes ajouts derrière leur voisin, pas en fin de document", () => {
    const base = doc(p("a", "A"), p("z", "Z"));
    const mine = doc(p("a", "A"), p("neuf", "inséré"), p("z", "Z"));
    const theirs = doc(p("a", "A"), p("z", "Z modifié"));

    const result = mergeDocs(base, mine, theirs);

    expect(result.conflicts).toEqual([]);
    expect(read(result.doc)).toEqual(["a:A", "neuf:inséré", "z:Z modifié"]);
  });

  it("laisse passer une suppression distante sur un bloc que je n'ai pas touché", () => {
    const base = doc(p("a", "A"), p("b", "B"));
    const mine = doc(p("a", "A modifié"), p("b", "B"));
    const theirs = doc(p("a", "A"));

    const result = mergeDocs(base, mine, theirs);

    expect(read(result.doc)).toEqual(["a:A modifié"]);
    expect(result.conflicts).toEqual([]);
  });

  it("signale le bloc supprimé chez l'autre et modifié chez moi", () => {
    const base = doc(p("a", "A"), p("b", "B"));
    const mine = doc(p("a", "A"), p("b", "B, que j'écrivais"));
    const theirs = doc(p("a", "A"));

    const result = mergeDocs(base, mine, theirs);

    // La suppression distante gagne dans le document…
    expect(read(result.doc)).toEqual(["a:A"]);
    // …mais elle ne passe pas en silence.
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toEqual({
      id: "b",
      mine: p("b", "B, que j'écrivais"),
      theirs: null,
    });
  });

  it("signale le bloc que j'ai supprimé et que l'autre écrivait", () => {
    const base = doc(p("a", "A"), p("b", "B"));
    const mine = doc(p("a", "A"));
    const theirs = doc(p("a", "A"), p("b", "B, qu'il écrivait"));

    const result = mergeDocs(base, mine, theirs);

    expect(read(result.doc)).toEqual(["a:A", "b:B, qu'il écrivait"]);
    // `mine: null` = mon geste était une suppression : restaurer, c'est retirer.
    expect(result.conflicts).toEqual([
      { id: "b", mine: null, theirs: p("b", "B, qu'il écrivait") },
    ]);
  });

  it("adopte l'ordre du côté qui a DÉPLACÉ, et le texte du côté qui a écrit", () => {
    const base = doc(p("a", "A"), p("b", "B"), p("c", "C"));
    // Moi : j'ai fait remonter C en tête (glisser-déposer), sans rien réécrire.
    const mine = doc(p("c", "C"), p("a", "A"), p("b", "B"));
    // Lui : il a réécrit B, sans rien déplacer.
    const theirs = doc(p("a", "A"), p("b", "B réécrit"), p("c", "C"));

    const result = mergeDocs(base, mine, theirs);

    expect(result.conflicts).toEqual([]);
    expect(read(result.doc)).toEqual(["c:C", "a:A", "b:B réécrit"]);
  });

  it("retombe sur l'ordre du serveur quand les deux ont déplacé", () => {
    const base = doc(p("a", "A"), p("b", "B"), p("c", "C"));
    const mine = doc(p("c", "C"), p("a", "A"), p("b", "B"));
    const theirs = doc(p("b", "B"), p("c", "C"), p("a", "A"));

    const result = mergeDocs(base, mine, theirs);

    expect(read(result.doc)).toEqual(["b:B", "c:C", "a:A"]);
  });

  it("rend le document du serveur quand je n'ai rien touché", () => {
    const base = doc(p("a", "A"));
    const theirs = doc(p("a", "A"), p("b", "leur ajout"));

    const result = mergeDocs(base, structuredClone(base), theirs);

    expect(result.doc).toEqual(theirs);
    expect(result.changed).toBe(false);
  });

  it("ne perd pas les blocs sans id : ils gardent leur place", () => {
    const anon = { type: "horizontalRule" };
    const base = doc(p("a", "A"), anon);
    const mine = doc(p("a", "A modifié"), anon);
    const theirs = doc(p("a", "A"), anon);

    const result = mergeDocs(base, mine, theirs);

    expect(result.doc.content).toHaveLength(2);
    expect(result.doc.content?.[1]).toEqual(anon);
  });
});

describe("applyRestore", () => {
  it("remet ma version d'un bloc contesté à sa place", () => {
    const base = doc(p("a", "A"), p("b", "B"));
    const mine = doc(p("a", "A"), p("b", "chez moi"));
    const theirs = doc(p("a", "A"), p("b", "chez l'autre"));

    const merged = mergeDocs(base, mine, theirs);
    const restored = applyRestore(merged.doc, merged.conflicts[0], mine);

    expect(read(restored)).toEqual(["a:A", "b:chez moi"]);
  });

  it("réinsère derrière son voisin le bloc que l'autre avait supprimé", () => {
    const base = doc(p("a", "A"), p("b", "B"), p("c", "C"));
    const mine = doc(p("a", "A"), p("b", "B, que j'écrivais"), p("c", "C"));
    const theirs = doc(p("a", "A"), p("c", "C"));

    const merged = mergeDocs(base, mine, theirs);
    const restored = applyRestore(merged.doc, merged.conflicts[0], mine);

    expect(read(restored)).toEqual(["a:A", "b:B, que j'écrivais", "c:C"]);
  });

  it("retire le bloc quand mon geste était une suppression", () => {
    const base = doc(p("a", "A"), p("b", "B"));
    const mine = doc(p("a", "A"));
    const theirs = doc(p("a", "A"), p("b", "B, qu'il écrivait"));

    const merged = mergeDocs(base, mine, theirs);
    const restored = applyRestore(merged.doc, merged.conflicts[0], mine);

    expect(read(restored)).toEqual(["a:A"]);
  });
});
