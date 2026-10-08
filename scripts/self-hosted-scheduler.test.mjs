import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../deploy/self-hosted/scheduler.mjs", import.meta.url), "utf8");
const cloudJobs = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).crons;
const secret = "scheduler-test-secret-with-32-characters";

test("self-hosted scheduling covers the Cloud job contract without omissions", () => {
  const jobs = runInNewContext(`${source}\nJOBS`, {
    process: { env: { CRON_SECRET: secret } },
    setTimeout: () => {},
  });
  assert.deepEqual(
    Array.from(jobs, ([schedule, path]) => `${path}:${schedule}`).sort(),
    cloudJobs.map(({ schedule, path }) => `${path}:${schedule}`).sort(),
  );
});

test("the minute tick drains persisted Numo turns with the configured authentication", async () => {
  const requests = [];
  class Minute extends Date {
    constructor() { super("2026-10-08T12:01:00Z"); }
    static now() { return new Minute().getTime(); }
  }
  await runInNewContext(`${source}\ntick()`, {
    process: { env: { CRON_SECRET: secret, MINDDY_SCHEDULER_URL: "http://instance.test:3000" } },
    Date: Minute,
    URL,
    AbortSignal,
    setTimeout: () => {},
    console: { log: () => {} },
    fetch: async (url, options) => {
      requests.push({ url: url.href, authorization: options.headers.Authorization });
      return { status: 200 };
    },
  });
  assert.ok(requests.some(request => request.url === "http://instance.test:3000/api/cron/numo-turns"));
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.authorization === `Bearer ${secret}`));
});
