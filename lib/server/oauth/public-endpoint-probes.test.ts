import { describe, expect, it } from "vitest";
import { GET as registerGet } from "@/app/api/oauth/register/route";
import { GET as tokenGet } from "@/app/api/oauth/token/route";
import { POST as mcpPost } from "@/app/api/mcp/route";

/**
 * What unauthenticated MCP health probes receive (MIN-772). Every answer is
 * the one the specs require; these tests keep it that way.
 */
describe("public MCP and OAuth endpoints under unauthenticated probes", () => {
  it.each([
    ["register", registerGet],
    ["token", tokenGet],
  ])(
    "answers GET on the POST-only %s endpoint with a 405 that names the allowed methods",
    async (_name, handler) => {
      const response = await handler();

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST, OPTIONS");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({ error: "invalid_request" });
    },
  );

  it("answers an MCP request without a bearer token with 401 and the resource metadata", async () => {
    const response = await mcpPost(
      new Request("https://minddy.test/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {},
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      "resource_metadata=",
    );
  });
});
