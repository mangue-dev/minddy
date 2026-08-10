import { describe, expect, it } from "vitest";

import { buildPageTree, type PageRow } from "./pages";
import { computePageMove, dropModeAt, type PageDropMode } from "./pages-move";

/**
 * MIN-270 — le glisser-déposer de l'arbre.
 *
 * Ce qui est épinglé ici est ce qu'on ne voit PAS en relisant le code : qu'un
 * déplacement « après mon voisin du dessous » bouge bien la page (et ne la
 * repose pas où elle était), et qu'un dépôt dans sa propre descendance soit
 * refusé AVANT le réseau — c'est la seule chose qui sépare l'arbre d'une
 * récursion infinie si jamais la garde serveur venait à passer.
 */

function page(id: string, parent: string | null, position: string): PageRow {
  return { id, parent_id: parent, title: id, position };
}

/** L'arbre rendu en chemins « a/b/c », dans l'ordre d'affichage. */
function paths(pages: PageRow[]): string[] {
  const out: string[] = [];
  const walk = (nodes: ReturnType<typeof buildPageTree<PageRow>>, prefix: string) => {
    for (const node of nodes) {
      const path = prefix ? `${prefix}/${node.id}` : node.id;
      out.push(path);
      walk(node.children, path);
    }
  };
  walk(buildPageTree(pages), "");
  return out;
}

/** Applique le déplacement à la liste à plat, comme le fait le cache. */
function moved(
  pages: PageRow[],
  dragId: string,
  targetId: string,
  mode: PageDropMode
): PageRow[] {
  const move = computePageMove(pages, dragId, targetId, mode);
  if (!move) throw new Error("déplacement refusé");
  return pages.map((p) =>
    p.id === dragId
      ? { ...p, parent_id: move.parent_id, position: move.position }
      : p
  );
}

describe("dropModeAt", () => {
  it("découpe la ligne en trois bandes", () => {
    expect(dropModeAt(2, 30)).toBe("before");
    expect(dropModeAt(15, 30)).toBe("inside");
    expect(dropModeAt(28, 30)).toBe("after");
  });

  it("dépose DEDANS sur une ligne sans hauteur mesurable", () => {
    expect(dropModeAt(0, 0)).toBe("inside");
  });
});

describe("computePageMove", () => {
  const flat = [
    page("a", null, "1"),
    page("b", null, "2"),
    page("c", null, "3"),
  ];

  it("réordonne dans la fratrie, sans changer de parent", () => {
    expect(paths(moved(flat, "c", "a", "before"))).toEqual(["c", "a", "b"]);
    expect(paths(moved(flat, "a", "b", "after"))).toEqual(["b", "a", "c"]);
  });

  it("déplace bien vers le bas — la page déplacée sort du calcul", () => {
    // Le piège : « a après b » avec `a` encore compté dans la fratrie donnerait
    // une position entre a et b, donc aucun mouvement visible.
    expect(paths(moved(flat, "a", "b", "after"))).toEqual(["b", "a", "c"]);
  });

  it("reparente en déposant DEDANS, en fin de sous-pages", () => {
    const nested = [...flat, page("a1", "a", "1")];
    expect(paths(moved(nested, "c", "a", "inside"))).toEqual([
      "a",
      "a/a1",
      "a/c",
      "b",
    ]);
  });

  it("remonte une sous-page à la racine", () => {
    const nested = [page("a", null, "1"), page("a1", "a", "1")];
    const after = moved(nested, "a1", "a", "after");
    expect(after.find((p) => p.id === "a1")?.parent_id).toBeNull();
    expect(paths(after)).toEqual(["a", "a1"]);
  });

  it("refuse de déposer une page sur elle-même", () => {
    expect(computePageMove(flat, "a", "a", "inside")).toBeNull();
  });

  it("refuse de déposer une page dans sa propre descendance", () => {
    const deep = [
      page("a", null, "1"),
      page("b", "a", "1"),
      page("c", "b", "1"),
    ];
    expect(computePageMove(deep, "a", "c", "inside")).toBeNull();
    expect(computePageMove(deep, "a", "c", "before")).toBeNull();
    // Mais un frère de la descendance reste une cible valide.
    expect(computePageMove(deep, "c", "b", "after")).not.toBeNull();
  });

  it("rend null sur une cible inconnue", () => {
    expect(computePageMove(flat, "a", "zzz", "inside")).toBeNull();
  });

  it("produit une position qui trie entre ses deux voisines", () => {
    const move = computePageMove(flat, "c", "a", "after");
    expect(move).not.toBeNull();
    expect(move!.position > "1").toBe(true);
    expect(move!.position < "2").toBe(true);
  });
});
