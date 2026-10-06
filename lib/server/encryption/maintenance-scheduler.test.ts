import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it.each([
  { time: "2026-09-23T00:14:59Z", path: "/api/cron/encryption-maintenance" },
])("runs authenticated $path on the self-hosted hourly schedule", async ({ time, path }) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(time));
  const fetch = vi.fn(async (_url: URL, _options: RequestInit) => ({ status: 200 }));
  const secret = "x".repeat(32);
  runInNewContext(readFileSync("deploy/self-hosted/scheduler.mjs", "utf8"), {
    Date, URL, AbortSignal, setTimeout, setInterval, fetch,
    console: { log: vi.fn() },
    process: { env: { CRON_SECRET: secret } },
  });
  expect(fetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1_000);
  const call = fetch.mock.calls.find(([url]) => String(url).endsWith(path));
  expect(call).toBeDefined();
  expect(String(call![0])).toBe(`http://minddy:3000${path}`);
  expect(call![1]).toMatchObject({ headers: { Authorization: `Bearer ${secret}` } });
});
