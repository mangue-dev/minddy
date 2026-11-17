import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIT_EXCEPTIONS,
  AUDIT_RESULT,
  AUDIT_TARGETS,
  activeException,
  isTransientAuditFailure,
  main,
  parseAuditAdvisories,
  runAuditTarget,
} from "./audit.mjs";

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

test("audits only dependency trees installed or packaged by CI", () => {
  assert.deepEqual(
    AUDIT_TARGETS.map(({ label, command }) => ({ label, command })),
    [
      {
        label: "root — pnpm-lock.yaml (the actually installed tree)",
        command: "pnpm",
      },
      {
        label: "desktop — package-lock.json (macOS shell)",
        command: "npm",
      },
      {
        label: "mobile — package-lock.json (Capacitor shell)",
        command: "npm",
      },
    ],
  );
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

  assert.equal(passed, AUDIT_RESULT.passed);
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

  assert.equal(passed, AUDIT_RESULT.failed);
  assert.equal(calls, 1);
});

test("reports unavailable after bounded transient retries are exhausted", async () => {
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

  assert.equal(passed, AUDIT_RESULT.unavailable);
  assert.equal(calls, 3);
});

test("fails when an executable dependency tree cannot be audited", async () => {
  const errors = [];
  const exitCode = await main({
    targets: [target],
    runTarget: async () => AUDIT_RESULT.unavailable,
    output: {
      log() {},
      warn() {},
      error(message) { errors.push(message); },
    },
  });

  assert.equal(exitCode, 2);
  assert.match(errors.join("\n"), /registry unavailable after retries/i);
  assert.match(errors.join("\n"), /could not be verified/i);
});

test("lets CI dependency review cover registry downtime explicitly", async () => {
  const warnings = [];
  const exitCode = await main({
    targets: [target],
    runTarget: async () => AUDIT_RESULT.unavailable,
    allowUnavailable: true,
    output: {
      log() {},
      warn(message) { warnings.push(message); },
      error() {},
    },
  });

  assert.equal(exitCode, 0);
  assert.match(warnings.join("\n"), /dependency review remains authoritative/i);
});

test("still fails the dependency gate for a vulnerability finding", async () => {
  const errors = [];
  const exitCode = await main({
    targets: [target],
    runTarget: async () => AUDIT_RESULT.failed,
    output: {
      log() {},
      warn() {},
      error(message) { errors.push(message); },
    },
  });

  assert.equal(exitCode, 1);
  assert.match(errors.join("\n"), /high\/critical vulnerability/i);
});

const EXCEPTION = { id: "GHSA-aaaa-bbbb-cccc", package: "fixture", expires: "2026-12-17", reason: "fixture" };

/** A pnpm `audit --json` report with the given advisories. */
function pnpmReport(advisories) {
  return JSON.stringify({
    advisories: Object.fromEntries(
      advisories.map(([id, severity], index) => [
        String(index),
        { github_advisory_id: id, severity, module_name: "fixture", title: `Fixture ${id}` },
      ]),
    ),
  });
}

/** An npm `audit --json` report: one direct advisory and one package that only points at it. */
function npmReport(id, severity) {
  return JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {
      fixture: { via: [{ url: `https://github.com/advisories/${id}`, severity, name: "fixture", title: "Fixture" }] },
      parent: { via: ["fixture"] },
    },
  });
}

async function auditWith(stdout, { status = 1, now = new Date("2026-11-17T12:00:00Z") } = {}) {
  return runAuditTarget(target, {
    spawn: () => ({ status, stdout, stderr: "" }),
    wait: async () => assert.fail("a report must not be retried"),
    retryDelays: [25],
    stdout: silentStream,
    stderr: silentStream,
    exceptions: [EXCEPTION],
    now,
  });
}

test("reads advisories from pnpm and npm JSON reports", () => {
  assert.deepEqual(
    parseAuditAdvisories(pnpmReport([["GHSA-1111-2222-3333", "high"]])).map(({ id, severity }) => ({ id, severity })),
    [{ id: "GHSA-1111-2222-3333", severity: "high" }],
  );
  assert.deepEqual(
    parseAuditAdvisories(npmReport("GHSA-1111-2222-3333", "critical")).map(({ id, severity }) => ({ id, severity })),
    [{ id: "GHSA-1111-2222-3333", severity: "critical" }],
  );
  assert.equal(parseAuditAdvisories("found 1 high severity vulnerability"), null);
  assert.equal(parseAuditAdvisories(JSON.stringify({ error: { code: "ENOTFOUND" } })), null);
});

test("passes when the only high advisory is covered by an exception", async () => {
  assert.equal(await auditWith(pnpmReport([[EXCEPTION.id, "high"]])), AUDIT_RESULT.passed);
  assert.equal(await auditWith(npmReport(EXCEPTION.id, "high")), AUDIT_RESULT.passed);
});

test("still fails on a high advisory that no exception covers", async () => {
  const report = pnpmReport([[EXCEPTION.id, "high"], ["GHSA-9999-8888-7777", "critical"]]);
  assert.equal(await auditWith(report), AUDIT_RESULT.failed);
  assert.equal(await auditWith(npmReport("GHSA-9999-8888-7777", "high")), AUDIT_RESULT.failed);
});

test("ignores advisories below high", async () => {
  assert.equal(await auditWith(npmReport("GHSA-9999-8888-7777", "moderate")), AUDIT_RESULT.passed);
});

test("an exception covers its expiry day and stops covering the day after", async () => {
  const report = pnpmReport([[EXCEPTION.id, "high"]]);
  assert.equal(await auditWith(report, { now: new Date("2026-12-17T23:00:00Z") }), AUDIT_RESULT.passed);
  assert.equal(await auditWith(report, { now: new Date("2026-12-18T00:00:00Z") }), AUDIT_RESULT.failed);
});

test("every exception is dated and explained", () => {
  for (const exception of AUDIT_EXCEPTIONS) {
    assert.match(exception.id, /^GHSA-[\w]{4}-[\w]{4}-[\w]{4}$/);
    assert.match(exception.expires, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(exception.package && exception.reason.length > 40, `${exception.id} needs a package and a reason`);
    assert.equal(activeException(exception.id, { now: new Date(`${exception.expires}T00:00:00Z`) }), exception);
  }
});
