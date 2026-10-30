import { describe, expect, it } from "vitest";
import { creationRelationKinds } from "./creation-relations";
import type { PendingRelationInput } from "@/lib/types";

const relation = (type: PendingRelationInput["type"]): PendingRelationInput => ({
  type, target_id: "t", target_type: "issue", target_label: "MIN-1 Target",
});

describe("creationRelationKinds", () => {
  it("offers every relation, and the hierarchy only to an issue", () => {
    expect(creationRelationKinds([], false)).toEqual(["blocks", "blocked_by", "related"]);
    expect(creationRelationKinds([], true)).toEqual(["blocks", "blocked_by", "related", "parent_of", "sub_issue_of"]);
  });

  it("keeps one parent or sub-issues, never both", () => {
    expect(creationRelationKinds([relation("sub_issue_of")], true)).toEqual(["blocks", "blocked_by", "related"]);
    expect(creationRelationKinds([relation("parent_of")], true)).toEqual(["blocks", "blocked_by", "related", "parent_of"]);
  });
});
