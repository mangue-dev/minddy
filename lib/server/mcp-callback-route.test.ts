import { NextRequest, type NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The OAuth callback ends the browser detour. When the flow was launched from
 * the desktop app (`mcp_desktop_return`, planted by the authorize route), the
 * browser goes through `/desktop/return` so the app reopens on the settings
 * page with the outcome — success or failure. The web keeps the plain
 * settings redirect; either way the outcome is visible.
 */

const mocks = vi.hoisted(() => ({
  userId: "alice" as string | null,
  complete: vi.fn(),
}));

vi.mock("@/lib/server/git/callback-session", () => ({
  readForgeCallbackSession: async () => ({
    userId: mocks.userId,
    applyCookies: (response: NextResponse) => response,
  }),
}));

vi.mock("@/lib/server/app-origin", () => ({
  canonicalAppOrigin: () => "https://www.minddy.app",
}));

vi.mock("@/lib/server/mcp-oauth", () => ({
  completeMcpOAuth: mocks.complete,
}));

const { GET } = await import(
  "@/app/api/account/mcp-connections/oauth/callback/route"
);

const ORIGIN = "https://www.minddy.app";
const SETTINGS = "/settings?tab=mcp-clients";

function get(cookie?: string): Promise<Response> {
  return GET(
    new NextRequest(
      `${ORIGIN}/api/account/mcp-connections/oauth/callback?code=abc&state=def`,
      { headers: cookie ? { cookie } : {} },
    ),
  ) as unknown as Promise<Response>;
}

beforeEach(() => {
  mocks.userId = "alice";
  mocks.complete.mockReset().mockResolvedValue(undefined);
});

describe("MCP OAuth callback redirect", () => {
  it("returns the web browser to the settings page on success", async () => {
    const response = await get();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}${SETTINGS}&mcp=connected`,
    );
    expect(mocks.complete).toHaveBeenCalledWith("alice", "def", "abc", undefined);
  });

  it("bounces the desktop handoff back to the app and clears its marker", async () => {
    const response = await get("mcp_desktop_return=1");
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(
      `${ORIGIN}/desktop/return`,
    );
    expect(location.searchParams.get("next")).toBe(`${SETTINGS}&mcp=connected`);
    expect(response.headers.get("set-cookie")).toContain(
      "mcp_desktop_return=;",
    );
  });

  it("bounces back even when the provider round trip failed", async () => {
    mocks.complete.mockRejectedValue(new Error("exchange failed"));
    const response = await get("mcp_desktop_return=1");
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/desktop/return");
    expect(location.searchParams.get("next")).toBe(`${SETTINGS}&mcp=error`);
  });

  it("reports a canceled authorization without consuming the transaction", async () => {
    mocks.userId = null;
    const response = await get();
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}${SETTINGS}&mcp=error`,
    );
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
