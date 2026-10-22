import { describe, expect, it } from "vitest";
import { createMcpHandler, type McpHandlerOptions } from "mcp-handler";
import { MCP_HANDLER_OPTIONS } from "./handler-options";
import { registerMinddyTools } from "./tools";

const MODERN_PROTOCOL_VERSION = "2026-07-28";

function post(handler: (request: Request) => Promise<Response>, body: unknown, headers = {}) {
  return handler(new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  }));
}

function handlerWith(options: McpHandlerOptions) {
  return createMcpHandler((server) => registerMinddyTools(server), options);
}

/** Reads the response to its end, or reports that it is still open after `ms`. */
async function readWithin(response: Response, ms: number): Promise<string | "open"> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + ms;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      await reader.cancel();
      return "open";
    }
    const chunk = await Promise.race([
      reader.read(),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), remaining)),
    ]);
    if (chunk === "timeout") {
      await reader.cancel();
      return "open";
    }
    if (chunk.done) return text;
    text += decoder.decode(chunk.value, { stream: true });
  }
}

function listenRequest() {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "subscriptions/listen",
    params: {
      notifications: { toolsListChanged: true },
      _meta: {
        "io.modelcontextprotocol/protocolVersion": MODERN_PROTOCOL_VERSION,
        "io.modelcontextprotocol/clientInfo": { name: "test", version: "1.0.0" },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  };
}

describe("MCP handler options", () => {
  it("does not advertise a changing tool list at initialization", async () => {
    const response = await post(handlerWith(MCP_HANDLER_OPTIONS), {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
    });
    const text = await response.text();
    const payload = JSON.parse(text.startsWith("{") ? text : text.split("data: ")[1]);

    expect(payload.result.capabilities.tools).toEqual({ listChanged: false });
  });

  it("closes a subscriptions/listen stream instead of holding it open", async () => {
    const headers = {
      "mcp-protocol-version": MODERN_PROTOCOL_VERSION,
      "mcp-method": "subscriptions/listen",
    };
    const closed = await readWithin(
      await post(handlerWith(MCP_HANDLER_OPTIONS), listenRequest(), headers),
      1_000,
    );
    expect(closed).toContain("notifications/subscriptions/acknowledged");
    expect(closed).toContain('"resultType":"complete"');

    // The SDK default: the same listen stays open until the client leaves.
    const { capabilities: _capabilities, ...withDefaults } = MCP_HANDLER_OPTIONS;
    const held = await readWithin(
      await post(handlerWith(withDefaults), listenRequest(), headers),
      300,
    );
    expect(held).toBe("open");
  });
});
