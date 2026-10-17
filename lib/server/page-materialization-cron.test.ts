import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";

const state = vi.hoisted(() => ({ materialize: vi.fn() }));
vi.mock("@/lib/server/pages", () => ({ materializeStalePages: state.materialize }));

import { GET, POST } from "@/app/api/cron/page-materialization/route";

const request = (authorized = true) => new NextRequest("http://localhost/api/cron/page-materialization", {
  headers: authorized ? { authorization: `Bearer ${"x".repeat(32)}` } : {},
});

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "x".repeat(32));
  state.materialize.mockReset().mockResolvedValue({ pages: 2, materialized: 2, failed: 0 });
});

it("requires cron authentication before materializing anything", async () => {
  for (const handler of [GET, POST]) {
    expect((await handler(request(false))).status).toBe(401);
  }
  expect(state.materialize).not.toHaveBeenCalled();
});

it("materializes stale pending typing every minute, on Vercel and self-hosted", async () => {
  expect(await (await GET(request())).json()).toEqual({ ok: true, pages: 2, materialized: 2, failed: 0 });
  expect(state.materialize).toHaveBeenCalledTimes(1);
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  expect(config.crons).toContainEqual({ path: "/api/cron/page-materialization", schedule: "* * * * *" });
  const scheduler = readFileSync("deploy/self-hosted/scheduler.mjs", "utf8");
  expect(scheduler).toContain('["* * * * *", "/api/cron/page-materialization"]');
});
