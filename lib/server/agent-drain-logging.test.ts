import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  afterJobs: [] as Array<() => Promise<void>>,
  service: vi.fn(),
  drain: vi.fn(),
  decode: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (job: () => Promise<void>) => h.afterJobs.push(job) };
});
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: h.service }));
vi.mock("@/lib/server/agent/drain", () => ({ drainAgentRuns: h.drain }));
vi.mock("@/lib/server/agent/run-deployment-content", () => ({
  decodeAgentDeploymentUrl: h.decode,
}));

import { GET } from "@/app/api/cron/agent-drain/route";

const sentinel = "MIN591_SECRET_PREVIEW_URL";
const secret = "x".repeat(32);

function request() {
  return new NextRequest("http://localhost/api/cron/agent-drain", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

function dueService(error?: string) {
  const result = { data: error ? null : [{
    id: "opaque-run-id", project_id: "project-id",
    deployment_url: "ciphertext", not_before: new Date().toISOString(),
  }], error: error ? { message: error } : null };
  const query = { select: vi.fn(), eq: vi.fn(), not: vi.fn(), lte: vi.fn(),
    order: vi.fn(), limit: vi.fn() };
  for (const method of ["select", "eq", "not", "lte", "order"] as const) {
    query[method].mockReturnValue(query);
  }
  query.limit.mockResolvedValue(result);
  return { from: vi.fn(() => query) };
}

beforeEach(() => {
  h.afterJobs.length = 0;
  h.service.mockReset();
  h.drain.mockReset().mockResolvedValue({ claimed: 0 });
  h.decode.mockReset().mockImplementation(async (row) => ({
    ...row, deployment_url: `https://${sentinel}.example`,
  }));
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("CRON_SECRET", secret);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("agent preview dispatch logs", () => {
  it.each([
    ["success", async () => ({ ok: true })],
    ["timeout", async () => { throw Object.assign(new Error(sentinel), { name: "TimeoutError" }); }],
    ["error", async () => { throw new Error(sentinel); }],
  ])("does not log deployment URLs or exception bodies on %s", async (_name, fetcher) => {
    h.service.mockReturnValue(dueService());
    vi.stubGlobal("fetch", vi.fn(fetcher));
    expect((await GET(request())).status).toBe(200);
    for (const job of h.afterJobs) await job();
    expect(fetch).toHaveBeenCalledOnce();
    const logs = JSON.stringify([
      vi.mocked(console.log).mock.calls, vi.mocked(console.error).mock.calls,
    ]);
    expect(logs).not.toContain(sentinel);
  });

  it("does not log database error messages", async () => {
    h.service.mockReturnValue(dueService(sentinel));
    vi.stubGlobal("fetch", vi.fn());
    expect((await GET(request())).status).toBe(200);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(sentinel);
  });

  it("returns a controlled failure when draining throws", async () => {
    h.service.mockReturnValue(dueService());
    h.drain.mockRejectedValue(new Error(sentinel));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "drain_failed" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(sentinel);
  });
});
