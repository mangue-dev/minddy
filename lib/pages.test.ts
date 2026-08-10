import { describe, expect, it } from "vitest";

import {
  ancestorsOf,
  buildPageTree,
  descendantIds,
  flattenPageTree,
  positionAtEnd,
  positionBetween,
  wouldCreateCycle,
  type Page,
  type PageNode,
} from "./pages";

/**
 * MIN-266 — l'arbre des pages, reconstruit côté client depuis la liste à plat.
 *
 * Ce qui est épinglé ici est ce qui casse un écran : une page qui DISPARAÎT de
 * l'arbre (parent absent), une fratrie dans le mauvais ordre, et surtout le
 * CYCLE — la profondeur étant illimitée, une boucle fait partir toute descente
 * en récursion infinie, et c'est un écran blanc en prod.
 */

let counter = 0;

function page(overrides: Partial<Page> & { id: string }): Page {
  counter += 1;
  return {
    project_id: "p1",
    parent_id: null,
    title: overrides.id,
    icon: null,
    content: null,
    version: 1,
    position: "V",
    created_by: null,
    created_at: `2026-08-10T00:00:${String(counter).padStart(2, "0")}Z`,
    updated_at: "2026-08-10T00:00:00Z",
    deleted_at: null,
    deleted_by: null,
    parent_block_removed: false,
    deleted_root_id: null,
    ...overrides,
  };
}

/**
 * L'arbre rendu en chemins « a/b/c », un par nœud, dans l'ordre d'affichage.
 * On descend par `children` et non par `parent_id` : c'est la STRUCTURE rendue
 * qu'on veut lire, pas la colonne dont elle est censée sortir.
 */
function paths(pages: Page[]): string[] {
  const out: string[] = [];
  const walk = (nodes: PageNode[], prefix: string) => {
    for (const node of nodes) {
      const path = prefix ? `${prefix}/${node.id}` : node.id;
      out.push(path);
      walk(node.children, path);
    }
  };
  walk(buildPageTree(pages), "");
  return out;
}

describe("buildPageTree", () => {
  it("reconstruit trois niveaux depuis la liste à plat", () => {
    const pages = [
      page({ id: "c", parent_id: "b" }),
      page({ id: "a" }),
      page({ id: "b", parent_id: "a" }),
    ];

    expect(paths(pages)).toEqual(["a", "a/b", "a/b/c"]);
    expect(flattenPageTree(buildPageTree(pages)).map((n) => n.depth)).toEqual([
      0, 1, 2,
    ]);
  });

  it("ordonne chaque fratrie par position, pas par ordre d'arrivée", () => {
    const pages = [
      page({ id: "root" }),
      page({ id: "third", parent_id: "root", position: "c" }),
      page({ id: "first", parent_id: "root", position: "a" }),
      page({ id: "second", parent_id: "root", position: "b" }),
    ];

    expect(buildPageTree(pages)[0].children.map((n) => n.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("remonte à la racine une page dont le parent n'est pas là", () => {
    // Le parent est à la corbeille : la lecture ne le rend pas. L'enfant doit
    // rester VISIBLE — une page invisible est pire qu'une page mal placée.
    const pages = [page({ id: "orphan", parent_id: "gone" })];

    expect(paths(pages)).toEqual(["orphan"]);
    expect(buildPageTree(pages)[0].depth).toBe(0);
  });

  it("ne boucle pas sur un cycle déjà présent en base", () => {
    const pages = [
      page({ id: "a", parent_id: "b" }),
      page({ id: "b", parent_id: "a" }),
    ];

    // Rendu possible : les deux membres deviennent des racines, aucune récursion.
    expect(paths(pages).sort()).toEqual(["a", "b"]);
  });
});

describe("descendantIds", () => {
  it("rend toute la descendance, la page non comprise", () => {
    const pages = [
      page({ id: "a" }),
      page({ id: "b", parent_id: "a" }),
      page({ id: "c", parent_id: "b" }),
      page({ id: "d", parent_id: "a" }),
      page({ id: "elsewhere" }),
    ];

    expect(descendantIds(pages, "a").sort()).toEqual(["b", "c", "d"]);
    expect(descendantIds(pages, "c")).toEqual([]);
  });
});

describe("ancestorsOf", () => {
  it("remonte du parent immédiat jusqu'à la racine", () => {
    const pages = [
      page({ id: "a" }),
      page({ id: "b", parent_id: "a" }),
      page({ id: "c", parent_id: "b" }),
    ];

    expect(ancestorsOf(pages, "c").map((p) => p.id)).toEqual(["b", "a"]);
    expect(ancestorsOf(pages, "a")).toEqual([]);
  });
});

describe("wouldCreateCycle", () => {
  const pages = [
    page({ id: "a" }),
    page({ id: "b", parent_id: "a" }),
    page({ id: "c", parent_id: "b" }),
  ];

  it("refuse de mettre une page sous un de ses descendants", () => {
    // A → B → C : reparenter A sous C fermerait la boucle.
    expect(wouldCreateCycle(pages, "a", "c")).toBe(true);
    expect(wouldCreateCycle(pages, "a", "b")).toBe(true);
  });

  it("refuse qu'une page devienne son propre parent", () => {
    expect(wouldCreateCycle(pages, "b", "b")).toBe(true);
  });

  it("laisse passer un déplacement légitime", () => {
    expect(wouldCreateCycle(pages, "c", "a")).toBe(false);
    expect(wouldCreateCycle(pages, "b", null)).toBe(false);
  });

  it("ne voit pas de cycle dans un parent inconnu", () => {
    // L'existence du parent est un AUTRE contrôle : ne pas la confondre avec
    // celui-ci ferait répondre 409 là où la réponse juste est 404.
    expect(wouldCreateCycle(pages, "a", "unknown")).toBe(false);
  });
});

describe("positionBetween", () => {
  it("range la nouvelle clé strictement entre ses voisines", () => {
    const first = positionBetween(null, null);
    const before = positionBetween(null, first);
    const after = positionBetween(first, null);
    const middle = positionBetween(first, after);

    expect(before < first).toBe(true);
    expect(first < middle).toBe(true);
    expect(middle < after).toBe(true);
  });

  it("tient mille insertions au même endroit sans collision", () => {
    // Le pire cas d'un index fractionnaire : toujours insérer juste après la
    // première page. Les clés s'allongent, elles ne se rejoignent jamais.
    let low = positionBetween(null, null);
    const high = positionBetween(low, null);
    const seen = new Set<string>([low, high]);
    for (let i = 0; i < 1000; i += 1) {
      const key = positionBetween(low, high);
      expect(low < key && key < high, `${low} < ${key} < ${high}`).toBe(true);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      low = key;
    }
  });

  it("retombe sur un bord plutôt que de lever sur des bornes incohérentes", () => {
    const key = positionBetween("z", "a");
    expect(key > "z").toBe(true);
  });
});

describe("positionAtEnd", () => {
  it("place la nouvelle page après toute la fratrie", () => {
    const siblings = [
      page({ id: "x", position: "a" }),
      page({ id: "y", position: "c" }),
      page({ id: "z", position: "b" }),
    ];

    expect(positionAtEnd(siblings) > "c").toBe(true);
    expect(positionAtEnd([])).toBeTruthy();
  });
});
