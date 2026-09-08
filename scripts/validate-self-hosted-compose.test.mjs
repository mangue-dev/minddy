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
    "deploy/self-hosted/database-proxy.mjs",
    "deploy/self-hosted/functions-bundle.json",
    "deploy/self-hosted/agent-runner.mjs",
    "deploy/self-hosted/agent-runner-egress.mjs",
    "deploy/self-hosted/agent-runner-git-relay.mjs",
    "deploy/self-hosted/.env.example",
  ]);
});

test("the full profile keeps application and Supabase traffic on internal networks", () => {
  const profile = readFileSync(resolve(root, "deploy/self-hosted/compose.full.yml"), "utf8");
  assert.match(profile, /networks:\n[\s\S]*?default:\n\s+internal: true/);
  assert.match(profile, /minddy:[\s\S]*?networks:\n\s+- default\n\s+- private\n\s+- agent_egress/);
  assert.match(profile, /caddy:[\s\S]*?networks:\n\s+- default\n\s+- edge\n\s+- private/);
  assert.match(profile, /auth:[\s\S]*?networks:\n\s+- default\n\s+- auth_egress/);
});

test("the full profile enforces the application password policy and leaked-password checks", () => {
  const profile = readFileSync(resolve(root, "deploy/self-hosted/compose.full.yml"), "utf8");
  assert.match(profile, /GOTRUE_PASSWORD_MIN_LENGTH: "8"/);
  assert.match(
    profile,
    /GOTRUE_PASSWORD_REQUIRED_CHARACTERS: "abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789"/,
  );
  assert.match(profile, /GOTRUE_PASSWORD_HIBP_ENABLED: "true"/);
  assert.match(profile, /GOTRUE_PASSWORD_HIBP_FAIL_CLOSED: "true"/);
  assert.match(profile, /GOTRUE_SESSIONS_TIMEBOX: "720h"/);
  assert.match(profile, /GOTRUE_SESSIONS_INACTIVITY_TIMEOUT: "168h"/);
});

test("every public self-hosted endpoint receives a one-year HSTS policy", () => {
  const managed = readFileSync(resolve(root, "deploy/self-hosted/Caddyfile"), "utf8");
  const full = readFileSync(resolve(root, "deploy/self-hosted/Caddyfile.full"), "utf8");
  assert.match(
    managed,
    /\{\$MINDDY_SITE_ADDRESS\}[\s\S]*?Strict-Transport-Security "max-age=31536000; includeSubDomains"/,
  );
  assert.match(
    full,
    /\{\$MINDDY_SITE_ADDRESS\}[\s\S]*?Strict-Transport-Security "max-age=31536000; includeSubDomains"/,
  );
  assert.match(
    full,
    /\{\$SUPABASE_SITE_ADDRESS\}[\s\S]*?Strict-Transport-Security "max-age=31536000; includeSubDomains"/,
  );
});

test("both server profiles bound database import request bodies at the proxy", () => {
  for (const file of ["Caddyfile", "Caddyfile.full"]) {
    const caddyfile = readFileSync(resolve(root, `deploy/self-hosted/${file}`), "utf8");
    assert.match(
      caddyfile,
      /@database_import path_regexp database_import \^\/api\/projects\/\[\^\/\]\+\/pages\/\[\^\/\]\+\/import\/\?\$/,
    );
    assert.match(
      caddyfile,
      /request_body @database_import \{\n\s+max_size 21MiB\n\s+\}/,
    );
    assert.match(
      caddyfile,
      /@database_import_plan path_regexp database_import_plan \^\/api\/projects\/\[\^\/\]\+\/pages\/import-plan\/\?\$/,
    );
    assert.match(
      caddyfile,
      /request_body @database_import_plan \{\n\s+max_size 2MiB\n\s+\}/,
    );
  }
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
