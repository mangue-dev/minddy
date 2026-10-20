import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertProductionRelease } from "./release-policy.mjs";
import { selectReleaseScopes } from "./release-scope.mjs";

const productionSha = "a".repeat(40);

test("allows only the SHA checked out and deployed to production", () => {
  assert.equal(
    assertProductionRelease({
      ref: "refs/heads/production",
      requestedSha: productionSha,
      checkoutSha: productionSha,
      productionSha,
    }),
    productionSha,
  );
});

test("rejects a tag requested outside the production SHA", () => {
  assert.throws(
    () => assertProductionRelease({
      ref: "refs/heads/production",
      requestedSha: "b".repeat(40),
      checkoutSha: "b".repeat(40),
      productionSha,
    }),
    /production .* differs from requested SHA/,
  );
});

test("rejects a trigger from main", () => {
  assert.throws(
    () => assertProductionRelease({
      ref: "refs/heads/main",
      requestedSha: productionSha,
      checkoutSha: productionSha,
      productionSha,
    }),
    /triggered from production/,
  );
});

test("a public core release always includes production promotion", () => {
  assert.deepEqual(
    selectReleaseScopes("custom", { core: false, web: false, desktop: false }, {
      core: true,
      web: false,
      desktop: false,
    }),
    { core: true, web: true, desktop: false },
  );
});

test("the release entry point promotes main before tagging production", () => {
  const deploy = readFileSync(new URL("../deploy.sh", import.meta.url), "utf8");
  const releaseWorkflow = readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  const releaseScope = readFileSync(new URL("./release-scope.mjs", import.meta.url), "utf8");

  const pushMain = deploy.indexOf("git push origin main");
  const promote = deploy.indexOf('dispatch_and_wait promote-production.yml main "$DEPLOYED_SHA"');
  const verifyProduction = deploy.indexOf('git rev-parse origin/production)" != "$DEPLOYED_SHA"');
  const release = deploy.indexOf('dispatch_and_wait release.yml production "$DEPLOYED_SHA"');

  assert.ok(pushMain !== -1 && pushMain < promote, "main is pushed before promotion");
  assert.ok(promote < verifyProduction, "production is checked after promotion");
  assert.ok(verifyProduction < release, "the verified production SHA is tagged last");
  assert.match(releaseWorkflow, /description: "Exact production SHA to tag"/);
  assert.match(releaseWorkflow, /git fetch origin production --tags/);
  assert.match(releaseScope, /rev-parse", "--verify", "origin\/production"/);
  assert.match(releaseScope, /changedFiles\(`\$\{productionRef\}\.\.HEAD`\)/);
});

test("production migrations run after approval and before the fast-forward, plan first", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/promote-production.yml", import.meta.url),
    "utf8",
  );
  const approval = workflow.indexOf("environment: cloud-production");
  const step = workflow.indexOf("- name: Apply production database migrations");
  const fastForward = workflow.indexOf("- name: Fast-forward production");
  assert.ok(approval !== -1 && approval < step, "migrations wait for the cloud-production approval");
  assert.ok(step < fastForward, "the schema reaches production before Vercel builds the promoted SHA");

  const block = workflow.slice(step, fastForward).match(/        run: \|\n([\s\S]*?)\n\n/)?.[1];
  assert.ok(block, "the migration step has a run block");
  const script = block.replace(/^          /gm, "");
  const directory = mkdtempSync(join(tmpdir(), "minddy-production-migrations-"));
  const bin = join(directory, "bin");
  const migrations = join(directory, "supabase", "migrations");
  mkdirSync(bin);
  mkdirSync(migrations, { recursive: true });
  // A stand-in for `npx supabase@…` that records each call in order.
  writeFileSync(join(bin, "npx"), '#!/bin/sh\necho "$*" >> "$CALLS"\necho "Would push these migrations"\n');
  chmodSync(join(bin, "npx"), 0o755);
  const run = (env) => spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], {
    cwd: directory,
    encoding: "utf8",
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      CALLS: join(directory, "calls.txt"),
      GITHUB_STEP_SUMMARY: join(directory, "summary.md"),
      SUPABASE_CLI_VERSION: "2.115.0",
      PRODUCTION_DATABASE_URL: "postgresql://fixture@pooler.example.test:5432/postgres",
      ...env,
    },
  });
  const calls = () => readFileSync(join(directory, "calls.txt"), "utf8").trim().split("\n");
  try {
    // Built from a variable: lib/sql-migration-references.test.ts rejects
    // literal migration names that are absent from supabase/migrations.
    const version = "20270101000000";
    writeFileSync(join(migrations, `${version}_first.sql`), "select 1;");
    assert.notEqual(run({ PRODUCTION_DATABASE_URL: "" }).status, 0, "a missing secret stops the step");

    const applied = run({});
    assert.equal(applied.status, 0, applied.stderr);
    assert.deepEqual(calls(), [
      "--yes supabase@2.115.0 db push --db-url postgresql://fixture@pooler.example.test:5432/postgres --dry-run",
      "--yes supabase@2.115.0 db push --db-url postgresql://fixture@pooler.example.test:5432/postgres --yes",
    ]);
    assert.match(readFileSync(join(directory, "summary.md"), "utf8"), /Production database migrations[\s\S]*Would push/);

    rmSync(join(directory, "calls.txt"));
    writeFileSync(join(migrations, `${version}_second.sql`), "select 2;");
    const duplicated = run({});
    assert.notEqual(duplicated.status, 0);
    assert.match(duplicated.stdout, /Duplicate migration versions: 20270101000000/);
    assert.throws(() => calls(), "a duplicated version stops before touching the database");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
