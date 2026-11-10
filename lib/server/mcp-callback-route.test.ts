import { NextRequest, type NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeMcpOAuthReturn } from "@/lib/mcp-authorization";

/**
 * The OAuth callback ends the browser detour. A web flow is redeemed here,
 * with the browser's session. A flow started in the desktop app (its state
 * carries the desktop marker) is not: the browser may have no minddy session,
 * so the provider's answer goes back through `/desktop/return` and the app
 * redeems it with its own session (MIN-912).
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
  oauthAppOrigin: () => "https://www.minddy.app",
}));

vi.mock("@/lib/server/mcp-oauth", () => ({
  completeMcpOAuth: mocks.complete,
  isDesktopMcpOAuthState: (state: string) => /^d[a-f0-9]{64}$/.test(state),
}));

const { GET } = await import(
  "@/app/api/account/mcp-connections/oauth/callback/route"
);

const ORIGIN = "https://www.minddy.app";
const SETTINGS = "/settings?tab=mcp";

const DESKTOP_STATE = `d${"a".repeat(64)}`;

function get(query = "code=abc&state=def"): Promise<Response> {
  return GET(
    new NextRequest(
      `${ORIGIN}/api/account/mcp-connections/oauth/callback?${query}`,
    ),
  ) as unknown as Promise<Response>;
}

function appReturn(response: Response) {
  const location = new URL(response.headers.get("location")!);
  expect(location.origin + location.pathname).toBe(`${ORIGIN}/desktop/return`);
  return new URL(location.searchParams.get("next")!, ORIGIN);
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

  it("hands a desktop flow's answer back to the app without redeeming it", async () => {
    mocks.userId = null;
    const response = await get(
      `code=4%2F0A%2Bb&state=${DESKTOP_STATE}&iss=https%3A%2F%2Fissuer.example`,
    );
    const next = appReturn(response);
    expect(next.pathname).toBe("/settings");
    expect(next.searchParams.get("tab")).toBe("mcp");
    expect(decodeMcpOAuthReturn(next.searchParams.get("mcp_oauth")!)).toEqual({
      state: DESKTOP_STATE,
      code: "4/0A+b",
      iss: "https://issuer.example",
    });
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("returns a refused desktop consent to the app as a failure", async () => {
    const next = appReturn(await get(`error=access_denied&state=${DESKTOP_STATE}`));
    expect(next.searchParams.get("mcp")).toBe("error");
    expect(next.searchParams.has("mcp_oauth")).toBe(false);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("reports a failed web exchange on the settings page", async () => {
    mocks.complete.mockRejectedValue(new Error("exchange failed"));
    const response = await get();
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}${SETTINGS}&mcp=error`,
    );
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
