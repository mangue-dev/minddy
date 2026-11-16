import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
  drainNumoTurns: vi.fn(),
  runHandedOffNumoTurn: vi.fn(),
  drainNumoWakeTurns: vi.fn(),
  drainNumoWatchTurns: vi.fn(),
}));

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: h.getServiceClient }));
vi.mock("@/lib/server/numo/turns", () => ({
  drainNumoTurns: h.drainNumoTurns,
  runHandedOffNumoTurn: h.runHandedOffNumoTurn,
}));
vi.mock("@/lib/server/numo/wake", () => ({ drainNumoWakeTurns: h.drainNumoWakeTurns }));
vi.mock("@/lib/server/numo/watch-clock", () => ({ drainNumoWatchTurns: h.drainNumoWatchTurns }));

import { GET as GET_NUMO } from "@/app/api/cron/numo-turns/route";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubGlobal("fetch", vi.fn());
  h.getServiceClient.mockReset();
  h.drainNumoTurns.mockReset();
  h.runHandedOffNumoTurn.mockReset();
});

describe("optional scheduler", () => {
  it("keeps the production Vercel schedules", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"),
    ) as { crons?: unknown[] };

    expect(config.crons).toHaveLength(14);
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
    expect(config.crons).toContainEqual({
      path: "/api/cron/smart-fill-reevaluation",
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
    h.drainNumoWakeTurns.mockResolvedValue({ ran: 2 });
    h.drainNumoWatchTurns.mockResolvedValue({ ran: 3 });

    const response = await GET_NUMO(
      new NextRequest("http://localhost/api/cron/numo-turns", {
        method: "POST",
        headers: { authorization: `Bearer ${"x".repeat(32)}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, claimed: 1, wakes: 2, reminders: 3 });
    // The turn hands itself to a new job before this request's limit (MIN-1010).
    expect(h.drainNumoTurns).toHaveBeenCalledWith({ limit: 1, deadlineAt: expect.any(Number) });
  });

  it("runs only the handed-off turn a previous job asked it to take (MIN-1010)", async () => {
    vi.stubEnv("CRON_SECRET", "x".repeat(32));
    h.runHandedOffNumoTurn.mockResolvedValue({ claimed: true });
    const turnId = "51600000-0000-4000-8000-000000000001";
    const startedAt = Date.now();

    const response = await GET_NUMO(
      new NextRequest(`http://localhost/api/cron/numo-turns?turn=${turnId}`, {
        method: "POST",
        headers: { authorization: `Bearer ${"x".repeat(32)}` },
      }),
    );

    expect(response.status).toBe(202);
    await vi.waitFor(() => expect(h.runHandedOffNumoTurn).toHaveBeenCalledTimes(1));
    const [id, options] = h.runHandedOffNumoTurn.mock.calls[0] as [string, { deadlineAt: number }];
    expect(id).toBe(turnId);
    expect(options.deadlineAt).toBeGreaterThan(startedAt + 240_000);
    expect(h.drainNumoTurns).not.toHaveBeenCalled();
  });

  it("refuses a handoff request without the cron secret or with a malformed turn", async () => {
    const unsigned = await GET_NUMO(new NextRequest(
      "http://localhost/api/cron/numo-turns?turn=51600000-0000-4000-8000-000000000001",
      { method: "POST" },
    ));
    expect(unsigned.status).toBe(401);

    vi.stubEnv("CRON_SECRET", "x".repeat(32));
    const malformed = await GET_NUMO(new NextRequest(
      "http://localhost/api/cron/numo-turns?turn=not-a-turn",
      { method: "POST", headers: { authorization: `Bearer ${"x".repeat(32)}` } },
    ));
    expect(malformed.status).toBe(400);
    expect(h.runHandedOffNumoTurn).not.toHaveBeenCalled();
  });

  it("keeps draining continuations when the background wakes and reminders fail (MIN-929, MIN-923)", async () => {
    vi.stubEnv("CRON_SECRET", "x".repeat(32));
    h.drainNumoTurns.mockResolvedValue({ claimed: 0 });
    h.drainNumoWakeTurns.mockRejectedValue(new Error("down"));
    h.drainNumoWatchTurns.mockRejectedValue(new Error("down"));
    const response = await GET_NUMO(
      new NextRequest("http://localhost/api/cron/numo-turns", {
        method: "POST",
        headers: { authorization: `Bearer ${"x".repeat(32)}` },
      }),
    );
    expect(await response.json()).toEqual({ ok: true, claimed: 0, wakes: 0, reminders: 0 });
  });
});
