import { describe, expect, it } from "vitest";
import { issueGraphEdges, layoutIssueGraph } from "./issue-graph-layout";
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
