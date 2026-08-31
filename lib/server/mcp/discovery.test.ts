import { describe, expect, it } from "vitest";
import {
  InMemoryTransport,
  LATEST_PROTOCOL_VERSION,
  McpServer,
} from "@modelcontextprotocol/server";
import {
  MCP_DISCOVERY_INSTRUCTIONS,
  MCP_FULL_USAGE_GUIDE,
} from "./instructions";
import { MAX_DISCOVERY_DESCRIPTION_CHARS } from "./discovery-metadata";
import { registerMinddyTools } from "./tools";

const EXPECTED_TOOL_NAMES = [
  "minddy_add_comment",
  "minddy_add_feedback_comment",
  "minddy_add_objective_comment",
  "minddy_add_page_comment",
  "minddy_add_resource",
  "minddy_add_scratchpad_tasks",
  "minddy_add_to_cycle",
  "minddy_append_to_page",
  "minddy_append_to_plan",
  "minddy_configure_feedback_board",
  "minddy_configure_webhook",
  "minddy_create_integration",
  "minddy_create_issue",
  "minddy_create_objective",
  "minddy_create_page",
  "minddy_create_routine",
  "minddy_delete_routine",
  "minddy_edit_issue_text",
  "minddy_edit_page_text",
  "minddy_fill_cycle",
  "minddy_get_cycle",
  "minddy_get_feedback",
  "minddy_get_feedback_board",
  "minddy_get_issue",
  "minddy_get_objective",
  "minddy_get_page",
  "minddy_get_project",
  "minddy_get_pull_request",
  "minddy_get_resource",
  "minddy_get_scratchpad",
  "minddy_link_feedback",
  "minddy_link_issues",
  "minddy_link_pull_request",
  "minddy_list_categories",
  "minddy_list_feedback",
  "minddy_list_inbox",
  "minddy_list_integrations",
  "minddy_list_issues",
  "minddy_list_members",
  "minddy_list_objectives",
  "minddy_list_pages",
  "minddy_list_projects",
  "minddy_list_routines",
  "minddy_promote_feedback",
  "minddy_remove_from_cycle",
  "minddy_respond_feedback",
  "minddy_revoke_integration",
  "minddy_search_pages",
  "minddy_set_scratchpad",
  "minddy_unlink_feedback",
  "minddy_update_feedback",
  "minddy_update_issues",
  "minddy_update_objective",
  "minddy_update_page",
  "minddy_update_plan_task",
  "minddy_update_routine",
  "minddy_update_scratchpad_task",
] as const;

interface ListedTool {
  name: string;
  title?: string;
  description?: string;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

interface InitializeResult {
  instructions?: string;
}

interface ListToolsResult {
  tools: ListedTool[];
}

interface WireRequestParams {
  [key: string]: unknown;
}

interface WireResponse {
  id: string | number;
  result?: unknown;
  error?: { message: string };
}

async function coldStart(): Promise<{
  initialize: InitializeResult;
  listings: ListToolsResult[];
}> {
  const server = new McpServer(
    { name: "minddy-test", version: "1.0.0" },
    { instructions: MCP_DISCOVERY_INSTRUCTIONS },
  );
  registerMinddyTools(server);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  let nextId = 1;
  const pending = new Map<number, (message: WireResponse) => void>();
  clientTransport.onmessage = (message) => {
    if (
      !("id" in message) ||
      message.id === null ||
      (!("result" in message) && !("error" in message))
    ) {
      return;
    }
    const resolve = pending.get(Number(message.id));
    if (!resolve) return;
    pending.delete(Number(message.id));
    resolve(message as WireResponse);
  };

  await clientTransport.start();
  await server.connect(serverTransport);

  const request = async <T>(
    method: string,
    params: WireRequestParams,
  ): Promise<T> => {
    const id = nextId++;
    const response = new Promise<WireResponse>((resolve) =>
      pending.set(id, resolve),
    );
    await clientTransport.send({ jsonrpc: "2.0", id, method, params });
    const message = await response;
    if (message.error) throw new Error(message.error.message);
    return message.result as T;
  };

  try {
    const initialize = await request<InitializeResult>("initialize", {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "minddy-cold-start-test", version: "1.0.0" },
    });
    await clientTransport.send({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    const listings = await Promise.all([
      request<ListToolsResult>("tools/list", {}),
      request<ListToolsResult>("tools/list", {}),
      request<ListToolsResult>("tools/list", {}),
    ]);
    return { initialize, listings };
  } finally {
    await server.close();
  }
}

describe("MCP cold-start discovery", () => {
  it("returns the complete stable catalog on every initialization and listing", async () => {
    const starts = await Promise.all([coldStart(), coldStart(), coldStart()]);
    const expected = [...EXPECTED_TOOL_NAMES].sort();

    for (const start of starts) {
      expect(start.initialize.instructions).toBe(MCP_DISCOVERY_INSTRUCTIONS);
      const baseline = start.listings[0].tools.map((tool) => tool.name);
      expect([...baseline].sort()).toEqual(expected);
      for (const listing of start.listings.slice(1)) {
        expect(listing.tools.map((tool) => tool.name)).toEqual(baseline);
      }
    }
  });

  it("keeps discovery descriptions compact, actionable, and correctly annotated", async () => {
    const { listings } = await coldStart();
    const tools = listings[0].tools;

    for (const tool of tools) {
      expect(tool.title?.trim(), tool.name).not.toBe("");
      expect(tool.description?.length, tool.name).toBeLessThanOrEqual(
        MAX_DISCOVERY_DESCRIPTION_CHARS,
      );
      expect(tool.description, tool.name).toContain("Returns JSON text");
      expect(tool.description, tool.name).not.toContain(MCP_FULL_USAGE_GUIDE);
      expect(typeof tool.annotations?.readOnlyHint, tool.name).toBe("boolean");
      expect(typeof tool.annotations?.openWorldHint, tool.name).toBe("boolean");
      if (tool.annotations?.readOnlyHint) {
        expect(tool.description, tool.name).toContain("Read-only");
      } else {
        expect(tool.description, tool.name).toContain("Changes Minddy data");
        expect(typeof tool.annotations?.destructiveHint, tool.name).toBe(
          "boolean",
        );
      }
    }

    expect(new Set(tools.map((tool) => tool.description)).size).toBe(
      tools.length,
    );
    for (const name of ["minddy_update_page", "minddy_append_to_page"]) {
      expect(tools.find((tool) => tool.name === name)?.description).toContain(
        "Important errors: page_stale",
      );
    }
    expect(
      tools.find((tool) => tool.name === "minddy_get_pull_request")?.annotations
        ?.openWorldHint,
    ).toBe(true);
    for (const name of ["minddy_delete_routine", "minddy_revoke_integration"]) {
      expect(
        tools.find((tool) => tool.name === name)?.annotations?.destructiveHint,
      ).toBe(true);
    }
  });

  it("enforces discovery metadata budgets while retaining the full reference", async () => {
    const { listings } = await coldStart();
    const descriptions = listings[0].tools.reduce(
      (total, tool) => total + (tool.description?.length ?? 0),
      0,
    );
    const repeatedInitializationCost =
      descriptions +
      MCP_DISCOVERY_INSTRUCTIONS.length * EXPECTED_TOOL_NAMES.length;

    expect(MCP_DISCOVERY_INSTRUCTIONS.length).toBeLessThanOrEqual(400);
    expect(descriptions).toBeLessThanOrEqual(25_000);
    expect(repeatedInitializationCost).toBeLessThanOrEqual(50_000);
    expect(MCP_FULL_USAGE_GUIDE.length).toBeGreaterThan(10_000);
    expect(MCP_FULL_USAGE_GUIDE).toContain("minddy_update_plan_task");
  });
});
