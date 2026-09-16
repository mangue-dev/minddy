import { describe, expect, it } from "vitest";
import {
  normalizeRelation,
  resolveRelations,
  resolveRelationsByIssue,
} from "./relation-constants";
import type { IssueRelation } from "./types";

const relations: IssueRelation[] = [
  { id: "blocks", source_id: "a", target_id: "b", type: "blocks" },
  { id: "related", source_id: "b", target_id: "c", type: "related" },
];

describe("resolveRelationsByIssue", () => {
  it("matches the per-issue resolver while indexing every endpoint once", () => {
    const statuses = new Map([
      ["a", "done"],
      ["b", "in_progress"],
      ["c", "todo"],
    ] as const);
    const indexed = resolveRelationsByIssue(relations, statuses);

    for (const id of ["a", "b", "c"]) {
      expect(indexed.get(id)).toEqual(resolveRelations(id, relations, statuses));
    }
  });

  it("does not duplicate a malformed self-relation", () => {
    const self: IssueRelation[] = [
      { id: "self", source_id: "a", target_id: "a", type: "related" },
    ];
    expect(resolveRelationsByIssue(self).get("a")).toEqual(
      resolveRelations("a", self)
    );
  });
});

describe("objective-ended relations (MIN-513)", () => {
  const objectiveBlocked: IssueRelation[] = [
    {
      id: "obj-blocks-issue",
      source_id: "obj-1",
      source_type: "objective",
      target_id: "a",
      target_type: "issue",
      type: "blocks",
    },
  ];

  it("resolves an objective blocker as blocked_by, with otherType objective", () => {
    expect(resolveRelations("a", objectiveBlocked)).toEqual([
      {
        id: "obj-blocks-issue",
        relation: "blocked_by",
        otherId: "obj-1",
        otherType: "objective",
        resolved: false,
      },
    ]);
  });

  it("marks the blockage resolved once the objective is closed", () => {
    const objectiveStatuses = new Map([["obj-1", "done"] as const]);
    expect(
      resolveRelations("a", objectiveBlocked, undefined, objectiveStatuses)[0]
        .resolved
    ).toBe(true);
  });

  it("indexes the issue end only for an issue↔objective pair", () => {
    const indexed = resolveRelationsByIssue(objectiveBlocked);
    expect(indexed.has("obj-1")).toBe(false);
    expect(indexed.get("a")).toHaveLength(1);
  });

  it("resolves from the objective's perspective too", () => {
    expect(resolveRelations("obj-1", objectiveBlocked)).toEqual([
      {
        id: "obj-blocks-issue",
        relation: "blocks",
        otherId: "a",
        otherType: "issue",
        resolved: false,
      },
    ]);
  });

  it("swaps the kind columns with the ids when normalizing blocked_by", () => {
    expect(
      normalizeRelation(
        { id: "a", type: "issue" },
        "blocked_by",
        { id: "obj-1", type: "objective" }
      )
    ).toEqual({
      source_id: "obj-1",
      source_type: "objective",
      target_id: "a",
      target_type: "issue",
      type: "blocks",
    });
  });

  it("canonicalizes a related pair with mixed kinds least-id-first", () => {
    expect(
      normalizeRelation(
        { id: "zz", type: "objective" },
        "related",
        { id: "aa", type: "issue" }
      )
    ).toEqual({
      source_id: "aa",
      source_type: "issue",
      target_id: "zz",
      target_type: "objective",
      type: "related",
    });
  });
});
