import { describe, expect, it } from "vitest";
import { convexHull, isSummarized, issueGraphEdges, layoutIssueGraph } from "./issue-graph-layout";
import type { IssueRelation } from "./types";

const relation = (source_id: string, target_id: string, type: IssueRelation["type"], extra: Partial<IssueRelation> = {}): IssueRelation => ({
  id: `${source_id}-${target_id}`,
  source_id,
  target_id,
  type,
  ...extra,
});

describe("issueGraphEdges", () => {
  it("keeps ticket-to-ticket links once, parents included", () => {
    const issues = [
      { id: "a", parent_id: null },
      { id: "b", parent_id: "a" },
      { id: "c", parent_id: null },
    ];
    expect(
      issueGraphEdges(issues, [
        relation("b", "c", "blocks"),
        // The same pair again, the other way round: one line is enough.
        relation("c", "b", "related"),
        // A ticket blocking an objective is not a ticket-to-ticket link.
        relation("a", "o1", "blocks", { target_type: "objective" }),
        // A deleted ticket is not drawn.
        relation("a", "gone", "related"),
      ]),
    ).toEqual([
      { source: "a", target: "b", kind: "parent" },
      { source: "b", target: "c", kind: "blocks" },
    ]);
  });
});

describe("layoutIssueGraph", () => {
  const edges = [
    { source: "a", target: "b", kind: "parent" as const },
    { source: "b", target: "c", kind: "blocks" as const },
    { source: "x", target: "y", kind: "related" as const },
  ];

  it("places every linked ticket inside the frame, the same way each time", () => {
    const graph = layoutIssueGraph(edges, { width: 400, height: 200 });
    expect(graph.nodes.map((node) => node.id).sort()).toEqual(["a", "b", "c", "x", "y"]);
    for (const node of graph.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(400);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(graph.height);
    }
    expect(graph.nodes.find((node) => node.id === "b")?.degree).toBe(2);
    expect(layoutIssueGraph(edges, { width: 400, height: 200 })).toEqual(graph);
  });

  it("keeps the most connected tickets when there are too many, even inside one big cluster", () => {
    // One cluster: a hub blocking three tickets, and a loose "related" chain.
    const cluster = [
      { source: "hub", target: "a", kind: "blocks" as const },
      { source: "hub", target: "b", kind: "blocks" as const },
      { source: "hub", target: "c", kind: "parent" as const },
      { source: "c", target: "d", kind: "related" as const },
      { source: "d", target: "e", kind: "related" as const },
    ];
    const graph = layoutIssueGraph(cluster, { maxNodes: 4 });
    expect(graph.nodes.map((node) => node.id).sort()).toEqual(["a", "b", "c", "hub"]);
    expect(graph.edges).toHaveLength(3);
    expect(graph.hiddenNodes).toBe(2);
  });

  it("shrinks the frame to a small drawing", () => {
    const graph = layoutIssueGraph([{ source: "a", target: "b", kind: "blocks" }], { width: 720, height: 380 });
    expect(graph.height).toBeLessThan(380);
    expect(graph.height).toBeGreaterThanOrEqual(160);
    for (const node of graph.nodes) expect(node.y).toBeLessThanOrEqual(graph.height);
  });

  it("is empty without links", () => {
    expect(layoutIssueGraph([]).nodes).toEqual([]);
  });
});

describe("objectives", () => {
  it("keeps the relations that reach a known objective", () => {
    const issues = [{ id: "a", parent_id: null }, { id: "b", parent_id: null }];
    expect(
      issueGraphEdges(
        issues,
        [
          relation("a", "o1", "blocks", { target_type: "objective" }),
          relation("o1", "o2", "related", { source_type: "objective", target_type: "objective" }),
          // An objective the graph does not draw (deleted, or filtered out).
          relation("b", "gone", "related", { target_type: "objective" }),
        ],
        [{ id: "o1" }, { id: "o2" }],
      ),
    ).toEqual([
      { source: "a", target: "o1", kind: "blocks" },
      { source: "o1", target: "o2", kind: "related" },
    ]);
  });

  it("gathers each objective's issues around its own anchor", () => {
    const edges = [
      { source: "a1", target: "a2", kind: "related" as const },
      { source: "a2", target: "a3", kind: "blocks" as const },
      { source: "b1", target: "b2", kind: "related" as const },
      { source: "b2", target: "b3", kind: "related" as const },
      // One link across the two objectives.
      { source: "a3", target: "b1", kind: "related" as const },
    ];
    const groupOf = new Map([["a1", "A"], ["a2", "A"], ["a3", "A"], ["b1", "B"], ["b2", "B"], ["b3", "B"]]);
    const graph = layoutIssueGraph(edges, { width: 720, height: 380, groupOf, objectiveIds: new Set(["A", "B"]) });
    const at = (id: string) => graph.nodes.find((node) => node.id === id)!;
    expect(at("A")).toMatchObject({ kind: "objective", group: "A" });
    expect(at("a1")).toMatchObject({ kind: "issue", group: "A" });
    const distance = (a: string, b: string) => Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y);
    for (const id of ["a1", "a2", "a3"]) expect(distance(id, "A")).toBeLessThan(distance(id, "B"));
    for (const id of ["b1", "b2", "b3"]) expect(distance(id, "B")).toBeLessThan(distance(id, "A"));
    expect(graph.groups).toEqual([{ objectiveId: "A", hiddenMembers: 0 }, { objectiveId: "B", hiddenMembers: 0 }]);
  });

  it("leaves every objective a few issues when it must leave some out", () => {
    // A busy objective with a dense core, and a quiet one.
    const edges = [
      ...["a2", "a3", "a4", "a5", "a6"].map((id) => ({ source: "a1", target: id, kind: "blocks" as const })),
      { source: "b1", target: "b2", kind: "related" as const },
    ];
    const groupOf = new Map([..."123456"].map((n) => [`a${n}`, "A"] as [string, string]).concat([["b1", "B"], ["b2", "B"]]));
    const graph = layoutIssueGraph(edges, { maxNodes: 5, groupOf, objectiveIds: new Set(["A", "B"]) });
    const shown = graph.nodes.filter((node) => node.kind === "issue").map((node) => node.id);
    expect(shown).toEqual(expect.arrayContaining(["b1", "b2"]));
    expect(shown).toHaveLength(5);
    expect(graph.groups.find((group) => group.objectiveId === "A")?.hiddenMembers).toBe(3);
  });
});

describe("convexHull", () => {
  it("keeps the outline and drops inner points", () => {
    const hull = convexHull([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 2, y: 2 }]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 2, y: 2 });
    expect(convexHull([{ x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }]);
  });
});

describe("isSummarized", () => {
  const groupOf = new Map([["a", "A"], ["b", "B"]]);
  const objectives = new Set(["A", "B"]);
  const link = (source: string, target: string) => isSummarized({ source, target, kind: "related" }, groupOf, objectives);

  it("sums up what leaves a group, and keeps what only a line can tell", () => {
    expect(link("a", "b")).toBe(true); // two objectives' issues
    expect(link("a", "loose")).toBe(true); // an objective's issue and an issue outside any
    expect(link("a", "B")).toBe(true); // an issue to another objective
    expect(link("a", "A")).toBe(false); // an issue to its own objective
    expect(link("loose", "A")).toBe(false); // an issue outside any objective to one
    expect(link("A", "B")).toBe(false); // two objectives
    expect(link("loose", "other")).toBe(false); // two issues outside any objective
  });
});
