import "server-only";

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { registerMinddyTools } from "@/lib/server/mcp/tools";
import { fail, type ToolExtra, type ToolResult } from "@/lib/server/mcp/tool-helpers";

const TOOL_NAME = "minddy_list_projects" as const;
type RegisteredTool = {
  description?: string;
  inputSchema: z.ZodObject;
  annotations?: { readOnlyHint?: boolean };
};
type Handler = (args: Record<string, unknown>, extra: ToolExtra) => Promise<ToolResult>;
type CapturedTool = { config: RegisteredTool; handler: Handler };
let registered: CapturedTool | null = null;

function tool(): CapturedTool {
  if (registered) return registered;
  const captured: CapturedTool[] = [];
  registerMinddyTools({
    registerTool(name: string, config: RegisteredTool, handler: Handler) {
      if (name !== TOOL_NAME) return;
      if (captured.length || config.annotations?.readOnlyHint !== true ||
          !(config.inputSchema instanceof z.ZodObject) || typeof handler !== "function") {
        throw new Error("Native prototype MCP contract changed");
      }
      captured.push({ config, handler });
    },
  } as unknown as McpServer, { descriptions: "full" });
  if (!captured[0]) throw new Error("Native prototype MCP tool is unavailable");
  registered = captured[0];
  return registered;
}

/** The private pilot advertises the existing tool's actual schema and description. */
export function nativePrototypeMcpTool(): {
  name: typeof TOOL_NAME; description: string; inputSchema: Record<string, unknown>;
} {
  const { config } = tool();
  return { name: TOOL_NAME, description: config.description ?? "",
    inputSchema: z.toJSONSchema(config.inputSchema.strict()) };
}

/** Call only after the server verifies the owning connection and its active attempt. */
export async function executeNativePrototypeMcp(args: unknown, userId: string): Promise<ToolResult> {
  const { config, handler } = tool();
  const parsed = config.inputSchema.strict().safeParse(args);
  if (!parsed.success) return fail("invalid_params", "Invalid Minddy tool arguments.");
  const extra: ToolExtra = userId ? { http: { authInfo: {
    // This label is never sent to the VM and grants no public MCP authentication.
    token: "native-prototype-internal", clientId: "native-prototype-internal", scopes: ["minddy"],
    extra: { userId, keyId: null },
  } } } : {};
  try { return await handler(parsed.data, extra); }
  catch { return fail("native_mcp_failed", "Minddy tool execution failed."); }
}
