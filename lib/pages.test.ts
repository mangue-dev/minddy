import { describe, expect, it } from "vitest";

import {
  ancestorsOf,
  buildPageTree,
  descendantIds,
  flattenPageTree,
  foldPath,
  positionAtEnd,
  positionBetween,
  splitFavoritePageTree,
  wouldCreateCycle,
  type Page,
  type PageNode,
} from "./pages";

/**
 * MIN-266 — the page tree, reconstructed on the client side from the flat list.
 *
 * What is pinned here is what breaks a screen: a page which DISAPPEARS from
 * the tree (absent parent), siblings in the wrong order, and above all
 * CYCLE — the depth being unlimited, a loop causes any descent
 * to go into infinite recursion, and it is a white screen in production.
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
    favorite: false,
    created_by: null,
    updated_by: null,
    updated_kind: "human",
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
 * The tree rendered in paths "a/b/c", one per node, in the order of display.
 * We descend by `children` and not by `parent_id`: it is the rendered STRUCTURE
 * that we want to read, not the column for which it is intended exit.
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
  it("reconstructs three levels from the flat list", () => {
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

  it("promotes a page whose parent is missing to the root", () => {
    // The parent is in the trash: reading does not return it. The child must
    // stay VISIBLE — an invisible page is worse than a misplaced page.
    const pages = [page({ id: "orphan", parent_id: "gone" })];

    expect(paths(pages)).toEqual(["orphan"]);
    expect(buildPageTree(pages)[0].depth).toBe(0);
  });

  it("does not loop on a cycle already present in the database", () => {
    const pages = [
      page({ id: "a", parent_id: "b" }),
      page({ id: "b", parent_id: "a" }),
    ];

    // Made possible: both members become roots, no recursion.
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
  it("walks from the immediate parent to the root", () => {
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

  it("rejects placing a page below one of its descendants", () => {
    // A → B → C: reparenting A under C would close the loop.
    expect(wouldCreateCycle(pages, "a", "c")).toBe(true);
    expect(wouldCreateCycle(pages, "a", "b")).toBe(true);
  });

  it("refuse qu'une page devienne son propre parent", () => {
    expect(wouldCreateCycle(pages, "b", "b")).toBe(true);
  });

  it("allows a legitimate move through", () => {
    expect(wouldCreateCycle(pages, "c", "a")).toBe(false);
    expect(wouldCreateCycle(pages, "b", null)).toBe(false);
  });

  it("does not see a cycle in an unknown parent", () => {
    // The existence of the parent is ANOTHER control: do not confuse it with
    // this one would answer 409 where the correct answer is 404.
    expect(wouldCreateCycle(pages, "a", "unknown")).toBe(false);
  });
});

describe("positionBetween", () => {
  it("places the new key strictly between its neighbors", () => {
    const first = positionBetween(null, null);
    const before = positionBetween(null, first);
    const after = positionBetween(first, null);
    const middle = positionBetween(first, after);

    expect(before < first).toBe(true);
    expect(first < middle).toBe(true);
    expect(middle < after).toBe(true);
  });

  it("handles one thousand insertions at the same place without collision", () => {
    // Worst case of a fractional index: always insert just after the
    // first page. The keys get longer, they never come together.
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

  it("falls back to an edge instead of throwing for inconsistent bounds", () => {
    const key = positionBetween("z", "a");
    expect(key > "z").toBe(true);
  });
});

describe("positionAtEnd", () => {
  it("places the new page after all siblings", () => {
    const siblings = [
      page({ id: "x", position: "a" }),
      page({ id: "y", position: "c" }),
      page({ id: "z", position: "b" }),
    ];

    expect(positionAtEnd(siblings) > "c").toBe(true);
    expect(positionAtEnd([])).toBeTruthy();
  });
});

/**
 * MIN-272 — the folding of the breadcrumbs of a subpage.
 *
 * What matters is not “it fits on one line” but WHICH levels
 * survive: it is those in the MIDDLE that disappear, never the two ends. The
 * root says which document we are in, the last says where we come from. Folding
 * at the end would make the direct parent disappear — the only link we use
 * really.
 */
describe("foldPath", () => {
  const path = (n: number) => Array.from({ length: n }, (_, i) => `n${i + 1}`);

  it("collapses nothing while the path is short", () => {
    expect(foldPath(path(1))).toEqual({ lead: "n1", hidden: [], tail: [] });
    expect(foldPath(path(3))).toEqual({
      lead: "n1",
      hidden: [],
      tail: ["n2", "n3"],
    });
  });

  it("replie le MILIEU, et garde les deux bouts", () => {
    expect(foldPath(path(6))).toEqual({
      lead: "n1",
      hidden: ["n2", "n3", "n4", "n5"],
      tail: ["n6"],
    });
  });

  it("returns no heading for an empty path — a root page has no thread", () => {
    expect(foldPath([])).toEqual({ lead: null, hidden: [], tail: [] });
  });

  it("ne modifie pas le tableau qu'on lui donne", () => {
    const trail = path(6);
    foldPath(trail);
    expect(trail).toEqual(path(6));
  });
});

/** Favorites are extracted as subtrees for the secondary sidebar. */
describe("splitFavoritePageTree", () => {
  const doc = () => [
    page({ id: "a", position: "A" }),
    page({ id: "a1", parent_id: "a", position: "A", favorite: true }),
    page({ id: "a1i", parent_id: "a1", position: "A" }),
    page({ id: "a2", parent_id: "a", position: "B" }),
    page({ id: "b", position: "B", favorite: true }),
    page({ id: "b1", parent_id: "b", position: "A" }),
  ];

  it("extracts favorites in tree order with their complete subtrees", () => {
    const { favorites } = splitFavoritePageTree(buildPageTree(doc()));

    expect(favorites.map((node) => node.id)).toEqual(["a1", "b"]);
    expect(flattenPageTree(favorites).map((node) => node.id)).toEqual([
      "a1",
      "a1i",
      "b",
      "b1",
    ]);
    expect(favorites.map((node) => node.depth)).toEqual([0, 0]);
    expect(favorites.map((node) => node.children[0].depth)).toEqual([1, 1]);
  });

  it("removes favorite subtrees from their original locations", () => {
    const { favorites, regular } = splitFavoritePageTree(buildPageTree(doc()));

    expect(flattenPageTree(regular).map((node) => node.id)).toEqual(["a", "a2"]);
    expect(
      [...flattenPageTree(favorites), ...flattenPageTree(regular)]
        .map((node) => node.id)
        .sort()
    ).toEqual(["a", "a1", "a1i", "a2", "b", "b1"]);
  });

  it("does not extract a nested favorite twice", () => {
    const nested = doc().map((item) =>
      item.id === "a1i" ? { ...item, favorite: true } : item
    );
    const { favorites } = splitFavoritePageTree(buildPageTree(nested));

    expect(favorites.map((node) => node.id)).toEqual(["a1", "b"]);
    expect(flattenPageTree(favorites).map((node) => node.id)).toEqual([
      "a1",
      "a1i",
      "b",
      "b1",
    ]);
  });

  it("keeps the full tree in the regular section when nothing is pinned", () => {
    const none = doc().map((p) => ({ ...p, favorite: false }));
    const tree = buildPageTree(none);
    const { favorites, regular } = splitFavoritePageTree(tree);

    expect(favorites).toEqual([]);
    expect(flattenPageTree(regular).map((node) => node.id)).toEqual(
      flattenPageTree(tree).map((node) => node.id)
    );
  });
});
