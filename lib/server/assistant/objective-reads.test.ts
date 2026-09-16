import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTool, type ToolContext } from "./execute-tool";
import { resolveObjectiveRef } from "@/lib/server/issue-reads";
import { CONVERSATION_ASSISTANT_TOOLS } from "./tools";

const { getProjectAccess } = vi.hoisted(() => ({ getProjectAccess: vi.fn() }));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess }));

const objectiveId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherObjectiveId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const issueId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let databaseError: { message: string } | null;

function database(): SupabaseClient {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let start = 0;
      let end = Infinity;
      const rows = () => (tables[table] ?? [])
        .filter((row) => filters.every((filter) => filter(row)))
        .slice(start, end);
      const query = {
        select: () => query,
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return query;
        },
        is(column: string, value: unknown) {
          filters.push((row) => (row[column] ?? null) === value);
          return query;
        },
        in(column: string, values: unknown[]) {
          filters.push((row) => values.includes(row[column]));
          return query;
        },
        or(expression: string) {
          const alternatives = expression.split(",").map((part) => part.split(".eq."));
          filters.push((row) => alternatives.some(([column, value]) => row[column] === value));
          return query;
        },
        order: () => query,
        range(from: number, to: number) {
          start = from;
          end = to + 1;
          return query;
        },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: databaseError }),
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ data: rows(), error: databaseError }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

function context(): ToolContext {
  return {
    projectId: null,
    requireExplicitProjectTarget: true,
    userId: "user-1",
    supabase: database(),
    service: database(),
    locale: "en",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  databaseError = null;
  getProjectAccess.mockResolvedValue({ project: { id: "project-1", key: "MIN" } });
  tables = {
    objectives: [
      { id: objectiveId, project_id: "project-1", name: "Release", description: "Ship it", status: "planned", lead_user_id: "user-1", target_date: null },
      { id: otherObjectiveId, project_id: "project-1", name: "Foundation", status: "in_progress", lead_user_id: null },
    ],
    issues: [{ id: issueId, project_id: "project-1", number: 7, title: "Prepare", status: "todo" }],
    issue_relations: [
      { id: "r1", project_id: "project-1", source_id: otherObjectiveId, source_type: "objective", target_id: objectiveId, target_type: "objective", type: "blocks" },
      { id: "r2", project_id: "project-1", source_id: objectiveId, source_type: "objective", target_id: issueId, target_type: "issue", type: "blocks" },
    ],
  };
});

describe("Numo get_objective", () => {
  it("executes the registered read and hydrates both endpoint kinds", async () => {
    const tool = CONVERSATION_ASSISTANT_TOOLS.find((candidate) => candidate.function.name === "get_objective");
    expect(tool?.function.parameters.required).toEqual(["project_id", "objective_id"]);
    const result = await executeTool("get_objective", { project_id: "project-1", objective_id: objectiveId }, context());
    expect(result).toEqual({
      success: true,
      result: {
        objective: tables.objectives[0],
        relations: [
          { relation: "blocked_by", objective_id: otherObjectiveId, name: "Foundation", status: "in_progress", lead_user_id: null },
          { relation: "blocks", issue_id: issueId, identifier: "MIN-7", title: "Prepare", status: "todo" },
        ],
      },
    });
    expect(getProjectAccess).toHaveBeenCalledWith("user-1", "project-1");
  });

  it.each([undefined, "obj:Release", "invalid"])("rejects invalid objective IDs: %s", async (id) => {
    const result = await executeTool("get_objective", { project_id: "project-1", objective_id: id }, context());
    expect(result.success).toBe(false);
  });

  it("rejects missing project targets and inaccessible projects", async () => {
    expect((await executeTool("get_objective", { objective_id: objectiveId }, context())).success).toBe(false);
    getProjectAccess.mockResolvedValue(null);
    expect((await executeTool("get_objective", { project_id: "project-1", objective_id: objectiveId }, context())).success).toBe(false);
  });

  it.each(["foreign", "deleted", "missing"])("rejects %s objectives", async (state) => {
    if (state === "foreign") tables.objectives[0].project_id = "project-2";
    if (state === "deleted") tables.objectives[0].deleted_at = "2026-09-17";
    if (state === "missing") tables.objectives.shift();
    expect(await executeTool("get_objective", { project_id: "project-1", objective_id: objectiveId }, context())).toEqual({
      success: false, result: { error: "Objective not found in this project." },
    });
  });

  it("excludes deleted and foreign relation targets", async () => {
    tables.objectives[1].deleted_at = "2026-09-17";
    tables.issues[0].project_id = "project-2";
    expect(await executeTool("get_objective", { project_id: "project-1", objective_id: objectiveId }, context())).toMatchObject({ success: true, result: { relations: [] } });
  });

  it("surfaces objective database errors", async () => {
    databaseError = { message: "Database unavailable" };
    expect(await executeTool("get_objective", { project_id: "project-1", objective_id: objectiveId }, context())).toEqual({ success: false, result: { error: "Database unavailable" } });
  });
});

describe("shared objective reference resolver", () => {
  const resolve = (reference: unknown) => resolveObjectiveRef(database(), { projectId: "project-1" }, reference);

  it.each(["Release_1", "Release%1", "Release*1", "Release(1)", "Release,1", "Release\\1"])("matches literal names: %s", async (name) => {
    tables.objectives[0].name = name;
    expect(await resolve(`OBJ:${name.toUpperCase()}`)).toMatchObject({ objective: { id: objectiveId } });
  });

  it("finds an exact name after substring matches and across pages", async () => {
    const exact = tables.objectives[0];
    tables.objectives = Array.from({ length: 210 }, (_, index) => ({ ...exact, id: `other-${index}`, name: `Release ${index}` }));
    tables.objectives.push(exact);
    expect(await resolve("obj:release")).toMatchObject({ objective: { id: objectiveId } });
    expect(await resolve("obj:Rele")).toMatchObject({ code: "issue_not_found" });
  });

  it("rejects ambiguous exact names including matches on later pages", async () => {
    const exact = tables.objectives[0];
    tables.objectives = [exact, ...Array.from({ length: 200 }, (_, index) => ({ ...exact, id: `other-${index}`, name: `Release ${index}` })), { ...exact, id: otherObjectiveId, name: "RELEASE" }];
    expect(await resolve("obj:Release")).toMatchObject({ code: "invalid_params", error: expect.stringContaining("Several objectives") });
  });

  it("forces prefixed UUID-shaped names through name matching", async () => {
    tables.objectives[1].name = objectiveId;
    expect(await resolve(objectiveId)).toMatchObject({ objective: { id: objectiveId } });
    expect(await resolve(`obj:${objectiveId}`)).toMatchObject({ objective: { id: otherObjectiveId } });
    tables.objectives.shift();
    expect(await resolve(objectiveId)).toMatchObject({ code: "issue_not_found" });
  });

  it("ignores foreign and deleted exact-name duplicates", async () => {
    tables.objectives.push({ ...tables.objectives[0], id: "foreign", project_id: "project-2" }, { ...tables.objectives[0], id: "deleted", deleted_at: "2026-09-17" });
    expect(await resolve("obj:Release")).toMatchObject({ objective: { id: objectiveId } });
  });

  it.each(["obj:", "", null])("rejects empty references: %s", async (reference) => {
    expect(await resolve(reference)).toMatchObject({ code: "invalid_params" });
  });

  it.each([objectiveId, "obj:Release"])("surfaces database errors for %s", async (reference) => {
    databaseError = { message: "Database unavailable" };
    expect(await resolve(reference)).toEqual({ code: "database_error", error: "Database unavailable" });
  });
});
