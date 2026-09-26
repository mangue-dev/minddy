import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTool, type ToolContext } from "./execute-tool";

const { getProjectAccess, createIssueForProject } = vi.hoisted(() => ({
  getProjectAccess: vi.fn(),
  createIssueForProject: vi.fn(),
}));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess }));
vi.mock("@/lib/server/create-issue", () => ({ createIssueForProject }));

const USER_ID = "51600000-0000-4000-8000-000000000001";
const PROJECT_ID = "07b14964-0def-4941-8ddf-686572d6345d";
type Row = Record<string, unknown>;

const PROJECT_ROW = { id: PROJECT_ID, name: "minddy", key: "MIN", owner_id: USER_ID };

/** Fake service client covering the project lookups the resolution performs. */
function service(projects: Array<Row> = [PROJECT_ROW]): SupabaseClient {
  const query = () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      order: () => builder,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: projects, error: null }).then(resolve),
    };
    return builder;
  };
  return {
    from: (table: string) =>
      table === "project_members"
        ? { ...query(), select: () => query() }
        : query(),
  } as unknown as SupabaseClient;
}

function context(client: SupabaseClient = service()): ToolContext {
  return {
    projectId: null,
    requireExplicitProjectTarget: true,
    userId: USER_ID,
    supabase: client,
    service: client,
    locale: "en",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectAccess.mockResolvedValue({ project: PROJECT_ROW });
  createIssueForProject.mockResolvedValue({
    ok: true,
    issue: { id: PROJECT_ID, number: 1 },
  });
});

describe("create_issue — the project a user names by key or label resolves to its id", () => {
  it.each(["MIN", "min", "minddy"])(
    "creates the issue in the project matched by '%s'",
    async (named) => {
      const out = await executeTool(
        "create_issue",
        { project_id: named, title: "Track it" },
        context(),
      );
      expect(out.success).toBe(true);
      expect(createIssueForProject).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: PROJECT_ID }),
      );
    },
  );

  it("refuses an unknown label at the access check, pointing back at list_projects", async () => {
    getProjectAccess.mockResolvedValue(null);
    const out = await executeTool(
      "create_issue",
      { project_id: "not-minddy", title: "Track it" },
      context(service([{ ...PROJECT_ROW, key: "OTHER" }])),
    );
    expect(out.success).toBe(false);
    expect(JSON.stringify(out.result)).toMatch(/list_projects/);
    expect(createIssueForProject).not.toHaveBeenCalled();
  });
});
