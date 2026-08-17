import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
  drainAgentRuns: vi.fn(),
}));

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: h.getServiceClient }));
vi.mock("@/lib/server/agent/drain", () => ({ drainAgentRuns: h.drainAgentRuns }));

import { GET } from "@/app/api/cron/agent-drain/route";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubGlobal("fetch", vi.fn());
  h.getServiceClient.mockReset();
  h.drainAgentRuns.mockReset();
});

describe("ordonnanceur facultatif", () => {
  it("ne programme aucun réveil Vercel dans la configuration par défaut", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"),
    ) as { crons?: unknown[] };
    const optIn = JSON.parse(
      readFileSync(new URL("../../vercel.cron.example.json", import.meta.url), "utf8"),
    ) as { crons?: unknown[] };

    expect(config.crons).toBeUndefined();
    expect(optIn.crons?.length).toBeGreaterThan(0);
  });

  it("laisse la route cron inerte sans CRON_SECRET", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/agent-drain", { method: "GET" }),
    );

    expect(response.status).toBe(401);
    expect(h.getServiceClient).not.toHaveBeenCalled();
    expect(h.drainAgentRuns).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reste inerte avec un secret pré-généré sans opt-in scheduler", async () => {
    vi.stubEnv("CRON_SECRET", "x".repeat(32));

    const response = await GET(
      new NextRequest("http://localhost/api/cron/agent-drain", {
        method: "GET",
        headers: { authorization: `Bearer ${"x".repeat(32)}` },
      }),
    );

    expect(response.status).toBe(401);
    expect(h.getServiceClient).not.toHaveBeenCalled();
    expect(h.drainAgentRuns).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
