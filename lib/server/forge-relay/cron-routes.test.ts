import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { GET as deliver, POST as deliverPost } from "@/app/api/cron/forge-relay-deliveries/route";
import { GET as maintain, POST as maintainPost } from "@/app/api/cron/forge-relay-maintenance/route";

const state = vi.hoisted(() => ({ deliver: vi.fn(), prune: vi.fn(), claims: vi.fn() }));
vi.mock("./fanout", () => ({
  processDueRelayDeliveries: state.deliver, pruneFinishedRelayDeliveries: state.prune,
}));
vi.mock("./claims", () => ({ pruneStaleRelayClaims: state.claims }));
const request = (authorized = true) => new NextRequest("http://localhost/api/cron/forge-relay-deliveries", {
  headers: authorized ? { authorization: `Bearer ${"x".repeat(32)}` } : {},
});
beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "x".repeat(32));
  state.deliver.mockReset().mockResolvedValue({ delivered: 1 });
  state.prune.mockReset().mockResolvedValue(3);
  state.claims.mockReset().mockResolvedValue(undefined);
});

it("requires cron authentication before delivery or maintenance", async () => {
  for (const handler of [deliver, deliverPost, maintain, maintainPost]) {
    expect((await handler(request(false))).status).toBe(401);
  }
  expect(state.deliver).not.toHaveBeenCalled();
  expect(state.prune).not.toHaveBeenCalled();
  expect(state.claims).not.toHaveBeenCalled();
});

it("delivers every minute without scanning finished delivery retention", async () => {
  for (const handler of [deliver, deliverPost]) {
    expect(await (await handler(request())).json()).toEqual({ delivered: 1 });
  }
  expect(state.deliver).toHaveBeenCalledTimes(2);
  expect(state.claims).toHaveBeenCalledTimes(2);
  expect(state.prune).not.toHaveBeenCalled();
});

it("runs retention separately every hour without processing deliveries", async () => {
  for (const handler of [maintain, maintainPost]) {
    expect(await (await handler(request())).json()).toEqual({ pruned: 3 });
  }
  expect(state.prune).toHaveBeenCalledTimes(2);
  expect(state.deliver).not.toHaveBeenCalled();
  expect(state.claims).not.toHaveBeenCalled();
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  expect(config.crons).toContainEqual({ path: "/api/cron/forge-relay-deliveries", schedule: "* * * * *" });
  expect(config.crons).toContainEqual({ path: "/api/cron/forge-relay-maintenance", schedule: "35 * * * *" });
  const scheduler = readFileSync("deploy/self-hosted/scheduler.mjs", "utf8");
  expect(scheduler).toContain('["* * * * *", "/api/cron/forge-relay-deliveries"]');
  expect(scheduler).toContain('["35 * * * *", "/api/cron/forge-relay-maintenance"]');
});
