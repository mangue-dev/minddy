import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
  drainAgentRuns: vi.fn(),
  drainNumoTurns: vi.fn(),
}));

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: h.getServiceClient }));
vi.mock("@/lib/server/agent/drain", () => ({ drainAgentRuns: h.drainAgentRuns }));
vi.mock("@/lib/server/numo/turns", () => ({ drainNumoTurns: h.drainNumoTurns }));

import { GET } from "@/app/api/cron/agent-drain/route";
import { GET as GET_NUMO } from "@/app/api/cron/numo-turns/route";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubGlobal("fetch", vi.fn());
  h.getServiceClient.mockReset();
  h.drainAgentRuns.mockReset();
  h.drainNumoTurns.mockReset();
});

describe("optional scheduler", () => {
  it("keeps the production Vercel schedules", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"),
    ) as { crons?: unknown[] };

    expect(config.crons).toHaveLength(10);
    expect(config.crons).toContainEqual({
      path: "/api/cron/numo-turns",
      schedule: "* * * * *",
    });
  });

  it("leaves the cron route inert without CRON_SECRET", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/agent-drain", { method: "GET" }),
    );

    expect(response.status).toBe(401);
    expect(h.getServiceClient).not.toHaveBeenCalled();
    expect(h.drainAgentRuns).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("authorizes Vercel Cron with the deployed secret", async () => {
    vi.stubEnv("CRON_SECRET", "x".repeat(32));
    h.getServiceClient.mockReturnValue({});
    h.drainAgentRuns.mockResolvedValue({ claimed: 0 });

    const response = await GET(
      new NextRequest("http://localhost/api/cron/agent-drain", {
        method: "GET",
        headers: { authorization: `Bearer ${"x".repeat(32)}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(h.getServiceClient).toHaveBeenCalledOnce();
    expect(h.drainAgentRuns).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("drains one durable Numo continuation with the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "x".repeat(32));
    h.drainNumoTurns.mockResolvedValue({ claimed: 1 });

    const response = await GET_NUMO(
      new NextRequest("http://localhost/api/cron/numo-turns", {
        method: "POST",
        headers: { authorization: `Bearer ${"x".repeat(32)}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, claimed: 1 });
    expect(h.drainNumoTurns).toHaveBeenCalledWith({ limit: 1 });
  });
});
