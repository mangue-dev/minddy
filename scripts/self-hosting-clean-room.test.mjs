import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  assertConsecutiveVersions,
  buildReport,
  candidateVersion,
  cloudEnvironmentFindings,
  parseArgs,
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
