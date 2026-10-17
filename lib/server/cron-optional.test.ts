import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
  drainNumoTurns: vi.fn(),
}));

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: h.getServiceClient }));
vi.mock("@/lib/server/numo/turns", () => ({ drainNumoTurns: h.drainNumoTurns }));

import { GET as GET_NUMO } from "@/app/api/cron/numo-turns/route";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubGlobal("fetch", vi.fn());
  h.getServiceClient.mockReset();
  h.drainNumoTurns.mockReset();
});

describe("optional scheduler", () => {
  it("keeps the production Vercel schedules", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"),
    ) as { crons?: unknown[] };

    expect(config.crons).toHaveLength(12);
    expect(JSON.stringify(config.crons)).not.toContain("agent-drain");
    expect(config.crons).toContainEqual({
      path: "/api/cron/numo-turns",
      schedule: "* * * * *",
    });
    expect(config.crons).toContainEqual({
      path: "/api/cron/encryption-maintenance",
      schedule: "15 * * * *",
    });
    expect(config.crons).toContainEqual({
      path: "/api/cron/issue-index",
      schedule: "25 * * * *",
    });
    expect(config.crons).toContainEqual({
      path: "/api/cron/page-materialization",
      schedule: "* * * * *",
    });
  });

  it("leaves the cron route inert without CRON_SECRET", async () => {
    const response = await GET_NUMO(
      new NextRequest("http://localhost/api/cron/numo-turns", { method: "GET" }),
    );

    expect(response.status).toBe(401);
    expect(h.drainNumoTurns).not.toHaveBeenCalled();
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
