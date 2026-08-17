import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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
  it("laisse la route cron inerte sans CRON_SECRET", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/agent-drain", { method: "GET" }),
    );

    expect(response.status).toBe(401);
    expect(h.getServiceClient).not.toHaveBeenCalled();
    expect(h.drainAgentRuns).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
