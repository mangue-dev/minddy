import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  assertReleaseReferences,
  createDisposableEnvironment,
  REQUIRED_PROFILE_FILES,
} from "./validate-self-hosted-compose.mjs";

const root = resolve(import.meta.dirname, "..");
const compatibility = JSON.parse(readFileSync(resolve(root, "deploy/self-hosted/compatibility.json"), "utf8"));
const entry = compatibility.entries[0];

test("the release profile inventory includes both Compose paths and their runtime assets", () => {
  assert.deepEqual(REQUIRED_PROFILE_FILES, [
    "deploy/self-hosted/compose.managed.yml",
    "deploy/self-hosted/compose.full.yml",
    "deploy/self-hosted/Caddyfile",
    "deploy/self-hosted/Caddyfile.full",
    "deploy/self-hosted/scheduler.mjs",
    "deploy/self-hosted/agent-runner.mjs",
    "deploy/self-hosted/.env.example",
  ]);
});

test("the full profile keeps application and Supabase traffic on internal networks", () => {
  const profile = readFileSync(resolve(root, "deploy/self-hosted/compose.full.yml"), "utf8");
  assert.match(profile, /networks:\n[\s\S]*?default:\n\s+internal: true/);
  assert.match(profile, /minddy:[\s\S]*?networks:\n\s+- default\n\s+- private\n\s+- agent_egress/);
  assert.match(profile, /caddy:[\s\S]*?networks:\n\s+- default\n\s+- edge\n\s+- private/);
});

test("both server profiles include routines and isolated agent execution by default", () => {
  for (const name of ["managed", "full"]) {
    const profile = readFileSync(resolve(root, `deploy/self-hosted/compose.${name}.yml`), "utf8");
    assert.match(profile, /\n  scheduler:\n/);
    assert.doesNotMatch(profile, /scheduled-jobs/);
    assert.match(profile, /\n  agent-runner:\n/);
    assert.match(profile, /\/var\/run\/docker\.sock:\/var\/run\/docker\.sock/);
    assert.match(profile, /AGENT_RUNNER_NETWORK: minddy-(?:managed|full)_agent_egress/);
  }
});

test("the disposable environment uses the compatibility-pinned images", () => {
  const environment = createDisposableEnvironment(entry, "/tmp/minddy-compose-test");
  assert.doesNotThrow(() => assertReleaseReferences(entry, environment));
  assert.equal(environment.MINDDY_IMAGE, entry.referenceCompose.minddyImage);
  assert.equal(environment.CADDY_IMAGE, entry.referenceCompose.caddyImage);
  assert.equal(environment.SCHEDULER_IMAGE, entry.referenceCompose.schedulerImage);
});

test("a changed image or missing release architecture is rejected", () => {
  const environment = createDisposableEnvironment(entry, "/tmp/minddy-compose-test");
  environment.CADDY_IMAGE = "caddy:latest";
  assert.throws(() => assertReleaseReferences(entry, environment), /CADDY_IMAGE must be pinned/);
  assert.throws(
    () => assertReleaseReferences({ ...entry, application: { ...entry.application, architectures: ["linux/amd64"] } }, createDisposableEnvironment(entry, "/tmp/minddy-compose-test")),
    /linux\/amd64 and linux\/arm64/,
  );
});
