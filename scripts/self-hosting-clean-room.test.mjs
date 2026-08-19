import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  assessEgress,
  assertConsecutiveVersions,
  buildEgressReport,
  buildReport,
  candidateVersion,
  cloudEnvironmentFindings,
  createEgressPolicy,
  parseArgs,
  parseEgressLog,
  providerForHost,
  redactSecrets,
  releaseVersion,
  REQUIRED_RELEASE_PATHS,
} from "./self-hosting-clean-room.mjs";

test("the managed-policy exporter is part of every clean-room candidate", () => {
  assert.ok(REQUIRED_RELEASE_PATHS.includes("scripts/export-managed-policies.sql"));
});

test("the two reference Compose profiles are part of every clean-room candidate", () => {
  assert.ok(REQUIRED_RELEASE_PATHS.includes("deploy/self-hosted/compose.managed.yml"));
  assert.ok(REQUIRED_RELEASE_PATHS.includes("deploy/self-hosted/compose.full.yml"));
  assert.ok(REQUIRED_RELEASE_PATHS.includes("scripts/smoke-self-hosted-compose.mjs"));
  assert.ok(REQUIRED_RELEASE_PATHS.includes("scripts/validate-self-hosted-compose.mjs"));
});

test("the guided installation tools are part of every clean-room candidate", () => {
  assert.ok(REQUIRED_RELEASE_PATHS.includes("scripts/self-hosting-install.mjs"));
  assert.ok(REQUIRED_RELEASE_PATHS.includes("scripts/self-hosting-doctor.mjs"));
  assert.ok(REQUIRED_RELEASE_PATHS.includes("scripts/self-hosting-maintenance.mjs"));
});

test("requires an explicit consecutive release pair", () => {
  assert.deepEqual(parseArgs(["--", "--from-tag", "v1.2.3", "--to-tag", "v1.2.4"]), {
    fromTag: "v1.2.3",
    toTag: "v1.2.4",
    report: null,
    checkEnvironment: true,
    mode: "release",
    egressLog: null,
    profile: null,
    allowedHosts: [],
  });
  assert.throws(() => parseArgs([]), /required/);
  assert.throws(() => assertConsecutiveVersions("v1.2.3", "v1.2.5"), /not consecutive/);
  assert.doesNotThrow(() => assertConsecutiveVersions("v0.9.9", "v0.10.0"));
  assert.doesNotThrow(() => assertConsecutiveVersions("v0.9.0", "v1.0.0"));
  assert.deepEqual(releaseVersion("v12.3.4"), [12, 3, 4]);
});

test("requires namespaced annotated refs for prepublication candidates", () => {
  assert.deepEqual(
    parseArgs([
      "--prepublication",
      "--from-ref",
      "preflight/v1.2.3",
      "--to-ref",
      "preflight/v1.2.4",
    ]),
    {
      fromRef: "preflight/v1.2.3",
      toRef: "preflight/v1.2.4",
      report: null,
      checkEnvironment: true,
      mode: "prepublication",
      egressLog: null,
      profile: null,
      allowedHosts: [],
    }
  );
  assert.equal(candidateVersion("preflight/v1.2.3"), "v1.2.3");
  assert.throws(() => candidateVersion("v1.2.3"), /not a preflight/);
  assert.throws(
    () => parseArgs(["--from-ref", "preflight/v1.2.3", "--to-ref", "preflight/v1.2.4"]),
    /require --prepublication/
  );
  assert.throws(
    () => parseArgs(["--prepublication", "--from-tag", "v1.2.3", "--to-tag", "v1.2.4"]),
    /candidate refs/
  );
});

test("requires observations from each deployed egress source", () => {
  const egressOptions = parseArgs([
    "--egress-log", "test/fixtures/self-hosted-egress/minimal.json",
    "--profile", "minimal",
  ]);
  assert.equal(egressOptions.mode, "egress");
  assert.equal(egressOptions.profile, "minimal");
  assert.match(egressOptions.egressLog, /test\/fixtures\/self-hosted-egress\/minimal\.json$/);
  assert.throws(() => parseArgs(["--profile", "minimal"]), /require --egress-log/);
  const policy = createEgressPolicy({
    env: {
      MINDDY_PUBLIC_APP_URL: "http://tickets.example.test",
      MINDDY_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      MINDDY_SCHEDULER_URL: "http://minddy:3000",
    },
  });
  const incomplete = assessEgress(policy, parseEgressLog(JSON.stringify({
    sources: ["browser", "server", "scheduler"],
    requests: [],
  })));
  assert.equal(incomplete.passed, false);
  assert.deepEqual(incomplete.missingSources, ["container"]);

  const complete = assessEgress(policy, parseEgressLog(JSON.stringify({
    sources: ["browser", "server", "scheduler", "container"],
    requests: [
      { source: "browser", url: "https://project.supabase.co/auth/v1/signup" },
      { source: "server", url: "https://project.supabase.co/rest/v1/projects" },
      { source: "scheduler", url: "http://minddy:3000/api/cron/routines" },
      { source: "container", host: "tickets.example.test" },
    ],
  })));
  assert.equal(complete.passed, true);
  assert.match(buildEgressReport(complete, "2026-08-19T00:00:00.000Z"), /Result: \*\*PASS\*\*/);
});

test("blocks disabled Minddy Cloud and vendor destinations with source-level evidence", () => {
  const policy = createEgressPolicy({ env: { MINDDY_PUBLIC_SUPABASE_URL: "https://project.supabase.co" } });
  const result = assessEgress(policy, {
    sources: ["browser", "server", "scheduler", "container"],
    requests: [
      { source: "browser", url: "https://minddy.app/api" },
      { source: "server", url: "https://api.stripe.com/v1/customers" },
      { source: "scheduler", url: "https://eu.posthog.com/capture" },
      { source: "container", url: "https://api.vercel.com/v1" },
      { source: "server", url: "https://openrouter.ai/api/v1/models" },
      { source: "server", url: "https://api.resend.com/emails" },
      { source: "browser", url: "https://telemetry.nextjs.org/api" },
      { source: "browser", url: "https://feedback.example.test/board" },
    ],
  });
  assert.equal(result.passed, false);
  assert.deepEqual(result.requests.map((request) => request.reason), [
    "Minddy Cloud is forbidden",
    "stripe is not enabled",
    "posthog is not enabled",
    "vercel is not enabled",
    "openrouter is not enabled",
    "resend is not enabled",
    "telemetry is not enabled",
    "undeclared destination",
  ]);
  const report = buildEgressReport(result, "2026-08-19T00:00:00.000Z");
  assert.doesNotMatch(report, /\/api|customers|capture|emails|board/);
  assert.match(report, /browser → `minddy\.app`: Minddy Cloud is forbidden/);
});

test("allows exactly one explicitly declared provider without widening the policy", () => {
  const policy = createEgressPolicy({
    profile: "provider",
    allowedHosts: ["api.resend.com"],
    env: { MINDDY_PUBLIC_SUPABASE_URL: "https://project.supabase.co" },
  });
  assert.equal(providerForHost("api.resend.com"), "resend");
  assert.deepEqual(policy.operatorHosts, ["api.resend.com"]);
  const result = assessEgress(policy, {
    sources: ["browser", "server", "scheduler", "container"],
    requests: [
      { source: "server", url: "https://api.resend.com/emails" },
      { source: "browser", url: "https://project.supabase.co/auth/v1/token" },
      { source: "scheduler", url: "http://minddy:3000/api/cron/routines" },
      { source: "container", host: "localhost" },
      { source: "server", url: "https://api.stripe.com/v1/customers" },
    ],
  });
  assert.equal(result.passed, false);
  assert.equal(result.requests[0].decision, "allowed");
  assert.equal(result.requests.at(-1).reason, "stripe is not enabled");
  assert.throws(() => createEgressPolicy({ allowedHosts: ["api.resend.com"] }), /minimal egress profile/);
  assert.throws(() => createEgressPolicy({ profile: "provider", allowedHosts: ["minddy.app"] }), /Minddy Cloud/);
});

test("does not allow an incompletely configured provider", () => {
  const policy = createEgressPolicy({
    profile: "provider",
    env: {
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "resend-key",
      MINDDY_PUBLIC_POSTHOG_HOST: "https://eu.posthog.com",
    },
  });
  assert.deepEqual(policy.operatorHosts, []);
  assert.deepEqual(policy.deniedProviders, ["stripe", "posthog", "vercel", "openrouter", "resend", "telemetry"]);
});

test("runs when the CLI entry path contains a filesystem symlink", () => {
  const directory = mkdtempSync(join(tmpdir(), "minddy-clean-room-link-"));
  const link = join(directory, "validate-self-hosted.mjs");
  try {
    symlinkSync(fileURLToPath(new URL("./self-hosting-clean-room.mjs", import.meta.url)), link);
    const result = spawnSync(process.execPath, [link, "--help"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage:/);
    const separated = spawnSync(process.execPath, [link, "--", "--help"], { encoding: "utf8" });
    assert.equal(separated.status, 0, separated.stderr);
    assert.match(separated.stdout, /Usage:/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects enabled proprietary services but accepts explicit local opt-outs", () => {
  assert.deepEqual(
    cloudEnvironmentFindings({
      MINDDY_MANAGED_AI: "0",
      MINDDY_MANAGED_BILLING: "false",
      MINDDY_EDITION: "self-hosted",
      AGENT_EXECUTION_BACKEND: "local",
      MINDDY_PUBLIC_POSTHOG_KEY: "",
    }),
    []
  );
  assert.deepEqual(
    cloudEnvironmentFindings({
      MINDDY_EDITION: "cloud",
      POSTHOG_API_KEY: "phx_test",
      AGENT_EXECUTION_BACKEND: "vercel",
    }),
    ["MINDDY_EDITION", "AGENT_EXECUTION_BACKEND", "POSTHOG_API_KEY"]
  );
});

test("redacts database passwords, bearer tokens, and named secrets", () => {
  const secret = "secret-value-123";
  const text = `TOKEN=${secret} postgresql://postgres:db-pass@example.test/db Bearer abc.def-123`;
  const redacted = redactSecrets(text, { SERVICE_TOKEN: secret });
  assert.doesNotMatch(redacted, /secret-value-123|db-pass|abc\.def-123/);
  assert.match(redacted, /\[redacted:SERVICE_TOKEN\]/);
});

test("the report distinguishes a blocked preflight from lifecycle evidence", () => {
  const report = buildReport({
    from: { tag: "v1.0.0", commit: "a".repeat(40), annotated: false, missingPaths: ["docs/self-hosting-clean-room.md"] },
    to: { tag: "v1.0.1", commit: "b".repeat(40), annotated: true, missingPaths: [] },
    ancestor: true,
    environmentFindings: ["POSTHOG_API_KEY"],
    generatedAt: "2026-08-18T00:00:00.000Z",
  });
  assert.match(report, /Result: \*\*BLOCKED\*\*/);
  assert.match(report, /v1\.0\.0:docs\/self-hosting-clean-room\.md/);
  assert.match(report, /POSTHOG_API_KEY/);
  assert.match(report, /lightweight tag/);
  assert.match(report, /not evidence that installation/);
});

test("a passing candidate report pins ref, tag-object, and promotion commit identities", () => {
  const report = buildReport({
    from: {
      tag: "v1.0.0",
      ref: "preflight/v1.0.0",
      tagObject: "1".repeat(40),
      commit: "a".repeat(40),
      packageVersion: "1.0.0",
      annotated: true,
      missingPaths: [],
    },
    to: {
      tag: "v1.0.1",
      ref: "preflight/v1.0.1",
      tagObject: "2".repeat(40),
      commit: "b".repeat(40),
      packageVersion: "1.0.1",
      annotated: true,
      missingPaths: [],
    },
    ancestor: true,
    environmentFindings: [],
    generatedAt: "2026-08-18T00:00:00.000Z",
    mode: "prepublication",
  });
  assert.match(report, /Result: \*\*PASS\*\*/);
  assert.match(report, /Validation mode: prepublication candidates/);
  assert.match(report, /preflight\/v1\.0\.0/);
  assert.match(report, /Source package version: `1\.0\.0`/);
  assert.match(report, /Target package version: `1\.0\.1`/);
  assert.match(report, new RegExp("1{40}"));
  assert.match(report, new RegExp("a{40}"));
  assert.match(report, /publish `v1\.0\.0` and `v1\.0\.1` only/);
});
