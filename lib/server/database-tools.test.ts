import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const h = vi.hoisted(() => ({ access: vi.fn(), getPage: vi.fn(), rpc: vi.fn(), event: vi.fn() }));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: h.access }));
vi.mock("@/lib/server/pages", () => ({ getPage: h.getPage }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ rpc: h.rpc }) }));
vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: (fn: () => Promise<void>) => fn() }));
vi.mock("@/lib/server/page-activity", () => ({ recordPageEvent: h.event }));

import { registerPageTools } from "./mcp/page-tools";
import { executePageTool } from "./agent/page-tools";
import { executeTool, type ToolContext } from "./assistant/execute-tool";
import { agentToolsFor } from "./agent/tools";
import { PROJECT_ASSISTANT_TOOLS } from "./assistant/tools";
import { PLATFORM_TOOLS_BY_ANCHOR } from "./agent/platform-tool-names";
import { DATABASE_TOOL_SCHEMA, DATABASE_TOOL_PARAMETERS } from "./database-tool-schema";

const PROJECT = "49930000-0000-4000-8000-000000000001";
const ACTOR = "49930000-0000-4000-8000-000000000002";
const DATABASE = "49930000-0000-4000-8000-000000000003";
const ENTRY = "49930000-0000-4000-8000-000000000004";
const PROPERTY = "49930000-0000-4000-8000-000000000005";
const KEY = "49930000-0000-4000-8000-000000000006";
const schema = [{ id: PROPERTY, name: "Amount", type: "number" }];
const page = { id: DATABASE, project_id: PROJECT, database_schema: schema, database_revision: 3 };
const valueArgs = { page_id: ENTRY, operation: "value", propertyId: PROPERTY, value: -12.5, expected: null };

type Callback = (args: Record<string, unknown>, extra: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>;
let callback: Callback;
let mcpSchema: z.ZodObject;
registerPageTools({ registerTool(name: string, config: { inputSchema: z.ZodObject }, handler: Callback) {
  if (name === "minddy_update_page_database") { callback = handler; mcpSchema = config.inputSchema; }
} } as unknown as McpServer);

const surfaces = ["mcp", "chat", "agent"] as const;
async function call(surface: typeof surfaces[number], args: Record<string, unknown>) {
  if (surface === "mcp") {
    const result = await callback(mcpSchema.parse({ project_id: PROJECT, ...args }), {
      http: { authInfo: { extra: { userId: ACTOR, keyId: KEY } } },
    });
    return { success: !result.isError, result: JSON.parse(result.content[0].text) };
  }
  if (surface === "agent") return executePageTool({ projectId: PROJECT, actorId: ACTOR }, "update_page_database", args);
  return executeTool("update_page_database", args, { projectId: PROJECT, userId: ACTOR, locale: "en" } as ToolContext);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.access.mockResolvedValue({ project: { id: PROJECT }, isOwner: true });
  h.getPage.mockImplementation(async (id: string) => ({ ok: true, page: id === DATABASE ? page : {
    id: ENTRY, project_id: PROJECT, parent_id: DATABASE, property_values: {},
  } }));
  h.rpc.mockResolvedValue({ data: { status: "updated" }, error: null });
});

describe.each(surfaces)("%s database tools", (surface) => {
  it("dispatches guarded cell writes with server-owned actor and key attribution", async () => {
    expect(await call(surface, { ...valueArgs, kind: "human", mcpKeyId: "spoofed" })).toMatchObject({ success: true });
    expect(h.rpc).toHaveBeenCalledWith("update_page_database_guarded", expect.objectContaining({
      p_project_id: PROJECT, p_page_id: ENTRY, p_actor_id: ACTOR,
      p_input: expect.objectContaining({ expected: null, value: -12.5, kind: "agent", mcpKeyId: surface === "mcp" ? KEY : null }),
    }));
    expect(h.event).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "agent", mcpKeyId: surface === "mcp" ? KEY : null }));
  });
  it("refuses inaccessible pages and invalid or incomplete cell edits before RPC", async () => {
    for (const change of [{ expected: undefined }, { value: "12a" }, { propertyId: KEY }]) {
      expect(await call(surface, { ...valueArgs, ...change })).toMatchObject({ success: false });
    }
    h.getPage.mockResolvedValue({ ok: true, page: { ...page, project_id: "another-project" } });
    expect(await call(surface, valueArgs)).toMatchObject({ success: false });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("forwards schema revisions and preserves stale-write failures", async () => {
    const args = { page_id: DATABASE, operation: "schema", schema, revision: 3, titleName: "Report" };
    expect(await call(surface, args)).toMatchObject({ success: true });
    h.rpc.mockResolvedValue({ data: { status: "conflict" }, error: null });
    expect(await call(surface, args)).toMatchObject({ success: false });
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });
  it("returns conversion previews and applies their token without losing attribution", async () => {
    const preview = { status: "preview", totalCount: 4, incompatibleCount: 1, token: "a".repeat(32) };
    const args = { page_id: DATABASE, operation: "convert", propertyId: PROPERTY, targetType: "date", revision: 3, preview: true };
    h.rpc.mockResolvedValueOnce({ data: preview, error: null });
    expect(await call(surface, args)).toEqual({ success: true, result: preview });
    expect(h.event).not.toHaveBeenCalled();
    expect(await call(surface, { ...args, preview: false, token: preview.token, confirmLoss: true })).toMatchObject({ success: true });
    expect(h.rpc).toHaveBeenLastCalledWith("convert_page_database_guarded", expect.objectContaining({
      p_input: expect.objectContaining({ preview: false, token: preview.token, confirmLoss: true, kind: "agent", mcpKeyId: surface === "mcp" ? KEY : null }),
    }));
    h.rpc.mockResolvedValue({ data: { status: "conflict" }, error: null });
    expect(await call(surface, { ...args, preview: false, token: preview.token })).toMatchObject({ success: false });
  });
});

it("advertises the shared contract on every Numo anchor and MCP", () => {
  for (const anchor of ["issue", "notebook", "pr"] as const) {
    expect(PLATFORM_TOOLS_BY_ANCHOR[anchor].has("update_page_database")).toBe(true);
    const tools = agentToolsFor({ anchor, webSearch: true, interactive: true });
    expect(tools.find(t => t.function.name === "update_page_database")?.function.parameters).toEqual(DATABASE_TOOL_PARAMETERS);
    expect(tools.find(t => t.function.name === "create_page")?.function.parameters.properties).toHaveProperty("database");
  }
  expect(PROJECT_ASSISTANT_TOOLS.find(t => t.function.name === "update_page_database")?.function.parameters.properties).toMatchObject(DATABASE_TOOL_PARAMETERS.properties);
  expect(mcpSchema.omit({ project_id: true }).shape).toEqual(DATABASE_TOOL_SCHEMA.shape);
});

it("rejects an ownerless coding run before any page lookup", async () => {
  expect(await executePageTool({ projectId: PROJECT, actorId: null }, "update_page_database", valueArgs)).toMatchObject({ success: false });
  expect(h.getPage).not.toHaveBeenCalled();
});
