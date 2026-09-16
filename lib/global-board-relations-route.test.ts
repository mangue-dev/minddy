import { beforeEach, describe, expect, it, vi } from "vitest";
import { cycleBlockingRelations, recoComparator } from "./cycle";
import { resolveRelations } from "./relation-constants";
import type { GlobalBoardResponse, IssueRelation } from "./types";

const state = vi.hoisted(() => ({
  relations: [] as Array<Record<string, unknown>>,
  selections: [] as string[],
}));

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("./supabase-service", () => ({ getServiceClient: () => ({}) }));
vi.mock("./server/project-members", () => ({
  buildMembersByProject: async () => ({ members: {}, projectIds: [] }),
}));
vi.mock("./server/cycles", () => ({ ensureCycles: vi.fn(), toCycleInfo: vi.fn(), todayInTz: vi.fn() }));
vi.mock("./cycle-prefs", () => ({ resolveCyclePrefs: () => ({ enabled: false }) }));
vi.mock("./server/api-auth", () => ({
  getAuthedUser: async () => ({
    ok: true,
    user: { id: "user", user_metadata: {} },
    supabase: {
      from(table: string) {
        let columns = "*";
        const query = {
          select(value: string) {
            columns = value;
            if (table === "issue_relations") state.selections.push(value);
            return query;
          },
          order() { return query; },
          is() { return query; },
          then(resolve: (result: unknown) => unknown) {
            const rows = table === "issue_relations" ? state.relations : [];
            return Promise.resolve({
              data: columns === "*" ? rows : rows.map((row) => Object.fromEntries(
                columns.split(",").map((column) => [column.trim(), row[column.trim()]])
              )),
              error: null,
            }).then(resolve);
          },
        };
        return query;
      },
    },
  }),
}));

const { GET } = await import("@/app/api/me/board/route");

beforeEach(() => {
  state.relations = [];
  state.selections = [];
});

async function load(relations: IssueRelation[]) {
  state.relations = relations.map((row) => ({ ...row }));
  const response = await GET(new Request("http://localhost/api/me/board") as never);
  expect(response.status).toBe(200);
  return await response.json() as GlobalBoardResponse;
}

describe("global board relation loading", () => {
  it("returns both kinds for issue, mixed, and objective pairs after every reload", async () => {
    const relations: IssueRelation[] = [
      { id: "ii", source_id: "a", source_type: "issue", target_id: "b", target_type: "issue", type: "related" },
      { id: "io", source_id: "a", source_type: "issue", target_id: "goal", target_type: "objective", type: "blocks" },
      { id: "oi", source_id: "goal", source_type: "objective", target_id: "b", target_type: "issue", type: "blocks" },
      { id: "oo", source_id: "goal", source_type: "objective", target_id: "other-goal", target_type: "objective", type: "related" },
    ];
    for (let reload = 0; reload < 2; reload++) {
      const board = await load(relations);
      expect(board.relations).toEqual(relations);
      expect(resolveRelations("b", board.relations)).toContainEqual(expect.objectContaining({ otherId: "goal", otherType: "objective" }));
    }
    expect(state.selections).toHaveLength(2);
  });

  it.each(["issue", "objective"] as const)("preserves %s-to-objective blocking for client cycle ordering", async (sourceType) => {
    const board = await load([{
      id: "block", source_id: "blocker", source_type: sourceType,
      target_id: "goal", target_type: "objective", type: "blocks",
    }]);
    const member = { id: "a", project_id: "project", title: "Blocked", status: "todo" as const, priority: "medium" as const, effort: "m" as const, category_ids: [] };
    const peer = { ...member, id: "z", title: "Unblocked" };
    for (const closed of [false, true]) {
      const { relations, objectiveStatuses } = cycleBlockingRelations(
        board.relations,
        new Map([["goal", [member.id]]]),
        new Map([["blocker", closed ? "done" : "planned"], ["goal", "planned"]]),
      );
      const statuses = sourceType === "objective"
        ? objectiveStatuses
        : new Map([["blocker", closed ? "done" as const : "todo" as const]]);
      expect([member, peer].sort(recoComparator(relations, statuses)).map((row) => row.id))
        .toEqual(closed ? ["a", "z"] : ["z", "a"]);
    }
  });
});
