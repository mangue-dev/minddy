import { describe, expect, it } from "vitest";
import { resolveRelations, resolveRelationsByIssue } from "./relation-constants";
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
