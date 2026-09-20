import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET } from "@/app/api/mcp-registry/route";

const mocks = vi.hoisted(() => ({
  authenticated: true,
  search: vi.fn(),
}));

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () =>
    mocks.authenticated
      ? { ok: true, user: { id: "alice" } }
      : {
          ok: false,
          response: NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 },
          ),
        },
}));

vi.mock("@/lib/server/session-rate-limit", () => ({
  rateLimitRefusal: () => null,
}));

vi.mock("@/lib/server/mcp-registry", () => ({
  searchMcpRegistry: mocks.search,
}));

function request(query?: string) {
  const url = new URL("https://minddy.test/api/mcp-registry");
  if (query !== undefined) url.searchParams.set("q", query);
  return new NextRequest(url);
}

beforeEach(() => {
  mocks.search.mockReset().mockResolvedValue([]);
});

describe("GET /api/mcp-registry", () => {
  it("refuses an anonymous search", async () => {
    mocks.authenticated = false;
    const response = await GET(request("grafana"));
    expect(response.status).toBe(401);
    expect(mocks.search).not.toHaveBeenCalled();
    mocks.authenticated = true;
  });

  it("refuses a query that is too short or too long", async () => {
    expect((await GET(request())).status).toBe(400);
    expect((await GET(request("a"))).status).toBe(400);
    expect((await GET(request("x".repeat(121)))).status).toBe(400);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("searches the registry with the trimmed query", async () => {
    mocks.search.mockResolvedValue([
      {
        id: "io.github.grafana/mcp-grafana",
        name: "Grafana",
        url: "https://mcp.grafana.com/mcp",
        transport: "http",
      },
    ]);
    const response = await GET(request("  grafana  "));
    expect(response.status).toBe(200);
    expect(mocks.search).toHaveBeenCalledWith("grafana");
    const body = await response.json();
    expect(body.servers).toHaveLength(1);
  });
});
