import assert from "node:assert/strict";
import test from "node:test";

import { isTransientAuditFailure, runAuditTarget } from "./audit.mjs";

const target = {
  label: "fixture lockfile",
  cwd: process.cwd(),
  command: "fixture-audit",
  args: [],
};

const silentStream = { write() {} };

test("classifies registry transport failures as transient", () => {
  assert.equal(isTransientAuditFailure("ERR_SOCKET_TIMEOUT registry request failed"), true);
  assert.equal(isTransientAuditFailure("npm warn audit network timeout at: registry"), true);
  assert.equal(isTransientAuditFailure("audit request failed, reason: socket hang up"), true);
  assert.equal(isTransientAuditFailure("503 Service Unavailable"), true);
  assert.equal(isTransientAuditFailure("found 1 high severity vulnerability"), false);
});

test("retries a transient audit failure and returns the later success", async () => {
  const results = [
    { status: 1, stdout: "", stderr: "ERR_SOCKET_TIMEOUT" },
    { status: 0, stdout: "found 0 vulnerabilities\n", stderr: "" },
  ];
  const delays = [];
  const spawnOptions = [];
  let calls = 0;

  const passed = await runAuditTarget(target, {
    spawn: (_command, _args, options) => {
      spawnOptions.push(options);
      return results[calls++];
    },
    wait: async (delay) => delays.push(delay),
    retryDelays: [25, 50],
    stdout: silentStream,
    stderr: silentStream,
  });

  assert.equal(passed, true);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [25]);
  assert.equal(spawnOptions[0].env.npm_config_fetch_retries, "0");
  assert.equal(spawnOptions[0].env.npm_config_fetch_timeout, "90000");
});

test("does not retry a reported vulnerability", async () => {
  let calls = 0;

  const passed = await runAuditTarget(target, {
    spawn: () => {
      calls += 1;
      return { status: 1, stdout: "found 1 high severity vulnerability", stderr: "" };
    },
    wait: async () => assert.fail("security findings must not be retried"),
    retryDelays: [25, 50],
    stdout: silentStream,
    stderr: silentStream,
  });

  assert.equal(passed, false);
  assert.equal(calls, 1);
});

test("still fails after the bounded transient retries are exhausted", async () => {
  let calls = 0;

  const passed = await runAuditTarget(target, {
    spawn: () => {
      calls += 1;
      return { status: 1, stdout: "", stderr: "ECONNRESET" };
    },
    wait: async () => {},
    retryDelays: [25, 50],
    stdout: silentStream,
    stderr: silentStream,
  });

  assert.equal(passed, false);
  assert.equal(calls, 3);
});
