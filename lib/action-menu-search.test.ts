import { describe, expect, it } from "vitest";
import { searchActionTree } from "@/lib/action-menu-search";

type Action = { id: string; label: string; keywords?: string[]; disabled?: boolean; children?: Action[] };

const tree: Action[] = [
  { id: "copy", label: "Copy identifier" },
  {
    id: "relations",
    label: "Relations",
    keywords: ["link"],
    children: [
      { id: "blocked-by", label: "Blocked by", keywords: ["relation"] },
      { id: "blocks", label: "Blocks", keywords: ["relation"] },
    ],
  },
  {
    id: "color",
    label: "Color",
    disabled: true,
    children: [{ id: "text", label: "Text", children: [{ id: "red", label: "Red" }] }],
  },
];

const ids = (query: string) => searchActionTree(tree, query).map(({ action, path }) => [...path, action.id].join(" > "));

describe("searchActionTree", () => {
  it("returns the top level unchanged without a query", () => {
    expect(ids("  ")).toEqual(["copy", "relations", "color"]);
  });

  it("finds an entry inside a submenu with the path that leads to it", () => {
    const [match] = searchActionTree(tree, "blocked");
    expect(match.action.id).toBe("blocked-by");
    expect(match.path).toEqual(["Relations"]);
  });

  it("keeps a matching branch and lists only the nested entries that match on their own", () => {
    expect(ids("relation")).toEqual(["relations", "Relations > blocked-by", "Relations > blocks"]);
    expect(ids("link")).toEqual(["relations"]);
  });

  it("walks every level but never returns a nested branch, only its entries", () => {
    expect(ids("text")).toEqual([]);
    expect(ids("red")).toEqual(["Color > Text > red"]);
  });

  it("matches the start of a word, not its middle", () => {
    expect(ids("by")).toEqual(["Relations > blocked-by"]);
    expect(ids("ocked")).toEqual([]);
    expect(ids("identifier")).toEqual(["copy"]);
  });

  it("disables an entry whose branch is disabled", () => {
    expect(searchActionTree(tree, "red")[0].disabled).toBe(true);
    expect(searchActionTree(tree, "blocks")[0].disabled).toBe(false);
  });
});
