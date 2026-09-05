import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeAgentMcpTool } from "./mcp-client";
import type { AgentRun } from "./runs";
import { MCP_CLIENT_TOOL_NAMES } from "@/lib/mcp-client-tools";
import {
  GLOBAL_ASSISTANT_TOOLS,
  PROJECT_ASSISTANT_TOOLS,
  PROJECT_SCOPED_TOOLS,
} from "../assistant/tools";
import { agentToolsFor } from "./tools";
import { PLATFORM_TOOLS_BY_ANCHOR } from "./platform-tool-names";
import { DOMAIN_TOOL_NAMES, schemaExpression } from "./vm/opencode-tools";
import { startToolBridge } from "./vm/tool-bridge";
import type { ControlPlaneClient } from "./vm/control-plane-client";
import type { VmJob } from "./vm/protocol";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  steered: vi.fn(),
  owner: "alice",
  error: null as string | null,
}));
vi.mock("@/lib/server/mcp-client", () => ({ executeMcpTool: mocks.execute }));
vi.mock("./runs", () => ({ runSteeredByOther: mocks.steered }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        maybeSingle: async () => ({
          data: { owner_id: mocks.owner },
          error: mocks.error,
        }),
      };
      return query;
    },
  }),
}));
// Only fields read by the MCP executor are relevant to this fixture.
const run = {
  id: "run",
  created_by: "alice",
  routine_id: null,
  project_id: "project",
} as AgentRun;
beforeEach(() => {
  mocks.execute
    .mockReset()
    .mockResolvedValue({ success: true, result: { connections: [] } });
  mocks.steered.mockReset().mockResolvedValue(false);
  mocks.owner = "alice";
  mocks.error = null;
});

describe("Numo MCP routing and personal identity", () => {
  it("uses the run creator regardless of model-supplied user or project arguments", async () => {
    await executeAgentMcpTool(run, "list_mcp_tools", {
      user_id: "bob",
      project_id: "elsewhere",
    });
    expect(mocks.execute).toHaveBeenCalledWith(
      "alice",
      "list_mcp_tools",
      expect.anything(),
    );
  });
  it("uses the project owner for routines and refuses transferred ownership", async () => {
    await executeAgentMcpTool(
      { ...run, routine_id: "routine" },
      "list_mcp_tools",
      {},
    );
    expect(mocks.execute).toHaveBeenCalledWith("alice", "list_mcp_tools", {});
    mocks.execute.mockClear();
    mocks.owner = "bob";
    expect(
      await executeAgentMcpTool(
        { ...run, routine_id: "routine" },
        "list_mcp_tools",
        {},
      ),
    ).toMatchObject({ success: false, result: { error: expect.any(String) } });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("refuses personal tools after another member steers either run type", async () => {
    mocks.steered.mockResolvedValue(true);
    for (const routine_id of [null, "routine"]) {
      expect(
        await executeAgentMcpTool({ ...run, routine_id }, "call_mcp_tool", {}),
      ).toMatchObject({ success: false, result: { error: expect.any(String) } });
    }
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("fails closed when the routine owner cannot be verified", async () => {
    mocks.error = "database unavailable";
    expect(
      await executeAgentMcpTool(
        { ...run, routine_id: "routine" },
        "list_mcp_tools",
        {},
      ),
    ).toMatchObject({ success: false, result: { error: expect.any(String) } });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("delivers discovery, tool results and refusals through the agent bridge", async () => {
    const callTool = vi.fn(
      (name: string, body: { args: Record<string, unknown> }) =>
        executeAgentMcpTool(run, name, body.args),
    );
    // Only catalog selection fields are read by the bridge.
    const job = {
      anchor: "issue",
      webSearch: false,
      subagents: { models: false },
      interactive: true,
      chain: false,
    } as unknown as VmJob;
    const bridge = await startToolBridge({
      job,
      cp: { callTool } as unknown as ControlPlaneClient,
      authorizationToken: "test-mcp-bridge-token",
      port: 0,
    });
    try {
      for (const [name, outcome] of [
        ["list_mcp_tools", {
          success: true,
          result: { connections: [{ id: "connection", name: "Tools" }] },
        }],
        ["call_mcp_tool", {
          success: true,
          result: { content: [{ type: "text", text: "Done" }] },
        }],
        ["call_mcp_tool", {
          success: false,
          result: {
            isError: true,
            content: [{ type: "text", text: "Rejected" }],
          },
        }],
      ] as const) {
        mocks.execute.mockResolvedValue(outcome);
        const response = await fetch(`${bridge.url}/tool/${name}`, {
          method: "POST",
          headers: {
            authorization: "Bearer test-mcp-bridge-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({ args: {} }),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(outcome.result);
        expect(await callTool.mock.results.at(-1)!.value).toEqual(outcome);
      }
      mocks.steered.mockResolvedValue(true);
      const response = await fetch(`${bridge.url}/tool/list_mcp_tools`, {
        method: "POST",
        headers: {
          authorization: "Bearer test-mcp-bridge-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ args: {} }),
      });
      expect(await response.json()).toEqual({
        error: expect.stringContaining("steered by another member"),
      });
      expect(await callTool.mock.results.at(-1)!.value).toMatchObject({
        success: false,
      });
    } finally {
      await bridge.close();
    }
  });
  it("serves both tools on every agent anchor and both assistant scopes", () => {
    for (const name of MCP_CLIENT_TOOL_NAMES) {
      expect(PROJECT_SCOPED_TOOLS.has(name)).toBe(false);
      for (const catalog of [GLOBAL_ASSISTANT_TOOLS, PROJECT_ASSISTANT_TOOLS]) {
        expect(
          catalog.find((tool) => tool.function.name === name)?.function
            .parameters.properties,
        ).not.toHaveProperty("project_id");
        expect(catalog.some((tool) => tool.function.name === name)).toBe(true);
      }
      for (const anchor of ["issue", "pr", "notebook"] as const) {
        expect(
          agentToolsFor({ anchor, webSearch: false }).some(
            (tool) => tool.function.name === name,
          ),
        ).toBe(true);
        expect(PLATFORM_TOOLS_BY_ANCHOR[anchor].has(name)).toBe(true);
      }
      expect(DOMAIN_TOOL_NAMES.has(name)).toBe(true);
    }
  });
  it("preserves arbitrary nested MCP arguments in generated OpenCode tool schemas", () => {
    const expression = schemaExpression({
      type: "object",
      additionalProperties: true,
    });
    const schema = new Function("tool", `return ${expression}`)({ schema: z });
    const args = { value: "hello", nested: { values: [true, 2, null] } };
    expect(schema.parse(args)).toEqual(args);
  });
});
