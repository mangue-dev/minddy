import { describe, expect, it } from "vitest";
import {
  normalizeRelation,
  resolveRelations,
  resolveRelationsByIssue,
  resolveDisplayRelationsByIssue,
} from "./relation-constants";
import type { Issue, IssueRelation, Objective } from "./types";

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
      expect(indexed.get(id)).toEqual(
        resolveRelations(id, relations, statuses),
      );
    }
  });

  it("does not duplicate a malformed self-relation", () => {
    const self: IssueRelation[] = [
      { id: "self", source_id: "a", target_id: "a", type: "related" },
    ];
    expect(resolveRelationsByIssue(self).get("a")).toEqual(
      resolveRelations("a", self),
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
        .resolved,
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
      normalizeRelation({ id: "a", type: "issue" }, "blocked_by", {
        id: "obj-1",
        type: "objective",
      }),
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
      normalizeRelation({ id: "zz", type: "objective" }, "related", {
        id: "aa",
        type: "issue",
      }),
    ).toEqual({
      source_id: "aa",
      source_type: "issue",
      target_id: "zz",
      target_type: "objective",
      type: "related",
    });
  });
});

describe("display dependencies through objective membership", () => {
  const objective = {
    id: "goal",
    name: "Launch",
    status: "planned",
  } as Objective;
  const member = {
    id: "member",
    number: 42,
    title: "Ship UI",
    status: "todo",
    objective_id: "goal",
  } as Issue;
  const blocker = {
    id: "blocker",
    number: 7,
    title: "Prepare API",
    status: "in_progress",
  } as Issue;
  const edge: IssueRelation = {
    id: "dependency",
    source_id: "blocker",
    target_id: "goal",
    target_type: "objective",
    type: "blocks",
  };
  const resolve = (
    rows = [edge],
    issues = [member, blocker],
    objectives = [objective],
  ) =>
    resolveDisplayRelationsByIssue(
      rows,
      new Map(issues.map((i) => [i.id, i])),
      new Map(objectives.map((o) => [o.id, o])),
    );

  it("shows the actual blocker and the objective responsible for inheritance", () => {
    expect(resolve().get(member.id)).toEqual([
      {
        id: edge.id,
        relation: "blocked_by",
        otherId: blocker.id,
        otherType: "issue",
        resolved: false,
        otherNumber: 7,
        otherName: "Prepare API",
        inheritedObjectiveId: "goal",
        inheritedObjectiveName: "Launch",
      },
    ]);
    expect(resolve().get(blocker.id)).toEqual([
      expect.objectContaining({
        relation: "blocks",
        otherType: "objective",
        otherName: "Launch",
      }),
    ]);
  });

  it.each(["done", "canceled", "duplicate"] as const)(
    "removes inherited blockage when its issue blocker is %s",
    (status) => {
      expect(
        resolve([edge], [member, { ...blocker, status }]).has(member.id),
      ).toBe(false);
    },
  );

  it.each(["done", "canceled"] as const)(
    "resolves direct and inherited objective blockers when %s",
    (status) => {
      const source = { ...objective, id: "source", name: "API", status };
      const objectiveEdge = {
        ...edge,
        source_id: "source",
        source_type: "objective" as const,
      };
      const directEdge = {
        ...objectiveEdge,
        id: "direct",
        target_id: "member",
        target_type: "issue" as const,
      };
      expect(
        resolve([objectiveEdge, directEdge], [member], [objective, source]).get(
          member.id,
        ),
      ).toEqual([
        expect.objectContaining({
          id: "direct",
          otherName: "API",
          resolved: true,
        }),
      ]);
    },
  );

  it("inherits an open objective blocker and recomputes when it reopens", () => {
    const source = {
      ...objective,
      id: "source",
      name: "API",
      status: "in_progress" as const,
    };
    const objectiveEdge = {
      ...edge,
      source_id: "source",
      source_type: "objective" as const,
    };
    const reopened = resolve([objectiveEdge], [member], [objective, source]);
    expect(reopened.get(member.id)).toEqual([
      expect.objectContaining({
        otherId: "source",
        otherType: "objective",
        otherName: "API",
        resolved: false,
        inheritedObjectiveId: "goal",
      }),
    ]);
    expect(
      resolve(
        [objectiveEdge],
        [member],
        [objective, { ...source, status: "done" }],
      ).has(member.id),
    ).toBe(false);
    expect(resolve([objectiveEdge], [member], [objective, source])).toEqual(
      reopened,
    );
  });

  it("updates inheritance after membership changes or an objective closes", () => {
    expect(
      resolve([edge], [{ ...member, objective_id: null }, blocker]).has(
        member.id,
      ),
    ).toBe(false);
    expect(
      resolve(
        [edge],
        [member, blocker],
        [{ ...objective, status: "done" }],
      ).has(member.id),
    ).toBe(false);
    expect(
      resolve([edge], [{ ...member, status: "done" }, blocker]).has(member.id),
    ).toBe(false);
  });

  it("does not duplicate direct dependencies or make the blocker block itself", () => {
    const direct = {
      ...edge,
      id: "direct",
      target_id: "member",
      target_type: "issue" as const,
    };
    const rows = resolve(
      [edge, direct],
      [member, { ...blocker, objective_id: "goal" }],
    );
    expect(rows.get(member.id)).toHaveLength(1);
    expect(rows.get(member.id)![0].inheritedObjectiveId).toBeUndefined();
    expect(rows.get(blocker.id)?.some((r) => r.relation === "blocked_by")).toBe(
      false,
    );
  });

  it("ignores related objective links and unknown or inaccessible endpoints", () => {
    expect(resolve([{ ...edge, type: "related" }]).has(member.id)).toBe(false);
    expect(resolve([edge], [member]).has(member.id)).toBe(false);
    expect(resolve([edge], [member, blocker], []).has(member.id)).toBe(false);
  });

  it("prioritizes inherited blockers over soft links and resolved dependencies", () => {
    const closed = { ...blocker, id: "closed", status: "done" as const };
    const soft = {
      ...edge,
      id: "soft",
      target_id: "member",
      target_type: "issue" as const,
      type: "related" as const,
    };
    const resolved = {
      ...soft,
      id: "resolved",
      source_id: "closed",
      type: "blocks" as const,
    };
    const result = resolve([soft, resolved, edge], [member, blocker, closed]);
    expect(result.get(member.id)?.map((r) => r.id)).toEqual([
      "dependency",
      "soft",
      "resolved",
    ]);
  });
});
