import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The tool policy is the one table every Numo layer reads. These checks tie
 * it to the two things it cannot type by itself: the schemas offered to the
 * model, and what the executor really does with each name.
 */

const h = vi.hoisted(() => ({ mcp: vi.fn() }));

/** A database client that fails on any use: no handler may reach a real one. */
const noDatabase = new Proxy({}, {
  get: () => () => { throw new Error("no database in this test"); },
}) as SupabaseClient;

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => noDatabase }));
vi.mock("@/lib/server/project-access", async (original) => ({
  ...await original<typeof import("@/lib/server/project-access")>(),
  getProjectAccess: async () => ({
    project: { id: PROJECT, key: "MIN", name: "minddy", owner_id: USER },
    isOwner: true, isMember: true, role: "owner", canWrite: true, canComment: true,
  }),
}));
vi.mock("@/lib/server/mcp-client", async (original) => ({
  ...await original<typeof import("@/lib/server/mcp-client")>(),
  executeMcpTool: h.mcp,
}));

const { executeTool } = await import("./execute-tool");
const { ASSISTANT_TOOLS, CONVERSATION_ASSISTANT_TOOLS } = await import("./tools");
const { NUMO_TOOL_NAMES, NUMO_TOOL_POLICY } = await import("./tool-policy");

const USER = "93800000-0000-4000-8000-000000000001";
const PROJECT = "93800000-0000-4000-8000-000000000002";

const ctx = {
  projectId: null,
  userId: USER,
  supabase: noDatabase,
  service: noDatabase,
  locale: "en",
};

beforeEach(() => {
  h.mcp.mockResolvedValue({ success: true, result: {} });
  vi.stubGlobal("fetch", async () => { throw new Error("no network in this test"); });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the Numo tool policy", () => {
  it("has exactly one schema for each tool it lists", () => {
    const schemas = ASSISTANT_TOOLS.map((tool) => tool.function.name);
    expect(new Set(schemas).size).toBe(schemas.length);
    expect(schemas.toSorted()).toEqual(NUMO_TOOL_NAMES.toSorted());
  });

  // proactive-guard.ts has one branch per tool below; a new `own_rule` tool
  // needs its branch there (until then the guard refuses it) and a line here.
  it("gives a background rule of its own only to the tools the guard has a branch for", () => {
    const ownRule = Object.entries(NUMO_TOOL_POLICY)
      .filter(([, policy]) => "background" in policy && policy.background === "own_rule")
      .map(([name]) => name);
    expect(ownRule.toSorted()).toEqual(["add_issues_to_cycle", "create_view", "notify_me", "update_view"]);
  });

  it("gives each tool the project_id its scope says", () => {
    for (const [index, tool] of CONVERSATION_ASSISTANT_TOOLS.entries()) {
      const name = tool.function.name;
      const { properties, required = [] } = tool.function.parameters;
      const projectId = properties.project_id as { type?: unknown } | undefined;
      switch (NUMO_TOOL_POLICY[name].scope) {
        // A personal tool keeps its own parameters: a project_id there is
        // the subject of a memory or a journal entry, not a target.
        case "personal":
        case "per_item":
          expect(tool, name).toBe(ASSISTANT_TOOLS[index]);
          break;
        case "project":
          expect(projectId?.type, name).toBe("string");
          expect(required, name).toContain("project_id");
          break;
        case "project_or_personal":
        case "view":
          expect(projectId?.type, name).toEqual(["string", "null"]);
          expect(required, name).toContain("project_id");
          break;
      }
    }
  });

  it("has a handler for every tool, on the side of the project resolution its scope says", async () => {
    for (const name of NUMO_TOOL_NAMES) {
      const execution = await executeTool(name, { project_id: PROJECT }, ctx);
      expect(JSON.stringify(execution.result), name).not.toMatch(/Unknown tool|No explicit project target/);
    }
    const unknown = await executeTool("no_such_tool", { project_id: PROJECT }, ctx);
    expect(unknown).toEqual({ success: false, result: { error: "Unknown tool: no_such_tool" } });
  });
});

describe("executeTool's error boundary", () => {
  it("turns a handler's rejection into a tool error and logs only the error's class", async () => {
    class ConnectionLost extends Error {}
    h.mcp.mockRejectedValue(new ConnectionLost("token sk-live-123 refused"));
    const execution = await executeTool("call_mcp_tool", { connection_id: "c", tool: "t", arguments: {} }, ctx);
    expect(execution).toEqual({ success: false, result: { error: "Tool execution failed" } });
    expect(console.error).toHaveBeenCalledWith("[assistant] tool_execution_failed",
      { tool: "call_mcp_tool", error: "ConnectionLost" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("sk-live-123");
  });
});

describe("tools that wait for the user", () => {
  it("are refused to an unattended routine before any project is resolved", async () => {
    for (const name of ["ask_user", "propose_backlog"]) {
      const execution = await executeTool(name, { questions: [] }, { ...ctx, routineId: "routine-1" });
      expect(execution.success, name).toBe(false);
      expect(JSON.stringify(execution.result), name).toMatch(/runs unattended/);
    }
  });
});
