import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  checkpointPath,
  createEnvironmentFile,
  createSupabaseJwt,
  environmentValues,
  normalizeImageReference,
  parseArgs as parseInstallArgs,
  parseEnvironment,
  recordCheckpoint,
  renderEnvironment,
} from "./self-hosting-install.mjs";
import { compatibilityFinding, configFindings, disabledCapabilities, parseArgs as parseDoctorArgs, redact } from "./self-hosting-doctor.mjs";
import { maintenanceMessage, parseArgs as parseMaintenanceArgs } from "./self-hosting-maintenance.mjs";

test("the installer creates a readable self-hosted configuration with integrations disabled", () => {
  const options = parseInstallArgs([
    "--non-interactive",
    "--mode", "managed",
    "--domain", "tickets.example.test",
    "--admin-email", "ops@example.test",
    "--supabase-url", "https://supabase.example.test",
    "--anon-key", "anon-key",
    "--service-role-key", "service-role-key",
    "--image", `ghcr.io/mangue-dev/minddy@sha256:${"b".repeat(64)}`,
  ]);
  const values = environmentValues(options, {
    CRON_SECRET: "cron", POSTGRES_PASSWORD: "postgres", JWT_SECRET: "jwt", ANON_KEY: "anon", SERVICE_ROLE_KEY: "service",
    SECRET_KEY_BASE: "base", VAULT_ENC_KEY: "vault", PG_META_CRYPTO_KEY: "meta", LOGFLARE_PUBLIC_ACCESS_TOKEN: "public",
    LOGFLARE_PRIVATE_ACCESS_TOKEN: "private", S3_PROTOCOL_ACCESS_KEY_ID: "access", S3_PROTOCOL_ACCESS_KEY_SECRET: "storage",
  });
  const rendered = renderEnvironment("MINDDY_IMAGE=ghcr.io/mangue-dev/minddy:v0.10.19\nMINDDY_HOST=tickets.example.com\nADMIN_EMAILS=ops@example.com\nMINDDY_MANAGED_AI=1\nMINDDY_MANAGED_BILLING=1\nAGENT_EXECUTION_BACKEND=cloud\n", values);
  const parsed = parseEnvironment(rendered);
  assert.equal(parsed.MINDDY_HOST, "tickets.example.test");
  assert.equal(parsed.ADMIN_EMAILS, "ops@example.test");
  assert.equal(parsed.MINDDY_MANAGED_AI, "0");
  assert.equal(parsed.MINDDY_MANAGED_BILLING, "0");
  assert.equal(parsed.AGENT_EXECUTION_BACKEND, "local");
  assert.equal(parsed.MINDDY_IMAGE, `ghcr.io/mangue-dev/minddy@sha256:${"b".repeat(64)}`);
});

test("the installer accepts only the release's immutable OCI pin", () => {
  const image = `ghcr.io/mangue-dev/minddy@sha256:${"a".repeat(64)}`;
  const options = parseInstallArgs(["--image", image]);
  assert.equal(options.image, image);
  assert.equal(normalizeImageReference(image), image);
  assert.throws(() => normalizeImageReference("ghcr.io/mangue-dev/minddy:v0.10.19"), /immutable minddy OCI digest/);
  assert.throws(() => normalizeImageReference(`ghcr.io/example/minddy@sha256:${"a".repeat(64)}`), /immutable minddy OCI digest/);
});

test("installer checkpoints are non-secret and survive a resume", () => {
  const directory = mkdtempSync(join(tmpdir(), "minddy-install-checkpoint-"));
  const envFile = join(directory, ".env");
  try {
    recordCheckpoint(envFile, "configuration");
    recordCheckpoint(envFile, "configuration");
    const state = JSON.parse(readFileSync(checkpointPath(envFile), "utf8"));
    assert.equal(Object.keys(state.phases).length, 1);
    assert.ok(state.phases.configuration);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("installer never overwrites an operator environment file", () => {
  const directory = mkdtempSync(join(tmpdir(), "minddy-install-no-overwrite-"));
  const envFile = join(directory, ".env");
  try {
    writeFileSync(envFile, "OPERATOR_VALUE=preserved\n", { mode: 0o600 });
    assert.throws(() => createEnvironmentFile(envFile, "OPERATOR_VALUE=replaced\n"), /EEXIST/);
    assert.equal(readFileSync(envFile, "utf8"), "OPERATOR_VALUE=preserved\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("complete-stack credentials are internally paired", () => {
  const token = createSupabaseJwt("test-secret", "service_role");
  const [header, payload, signature] = token.split(".");
  assert.ok(header && payload && signature);
  assert.match(Buffer.from(payload, "base64url").toString(), /service_role/);
});

test("the doctor reports only keys and redacts connection passwords", () => {
  assert.deepEqual(configFindings({ MINDDY_HOST: "host" }), [
    "MINDDY_PUBLIC_APP_URL", "MINDDY_PUBLIC_SUPABASE_URL", "MINDDY_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_EMAILS",
  ]);
  assert.ok(disabledCapabilities({ MINDDY_MANAGED_AI: "0", STRIPE_SECRET_KEY: "" }).includes("MINDDY_MANAGED_AI"));
  assert.doesNotMatch(redact("postgresql://postgres:private@example.test/db Bearer abc.def"), /private|abc\.def/);
  assert.equal(parseDoctorArgs(["--mode", "full", "--supabase-compose", "/tmp/docker-compose.yml"]).mode, "full");
  const digest = `ghcr.io/mangue-dev/minddy@sha256:${"a".repeat(64)}`;
  assert.deepEqual(compatibilityFinding({ MINDDY_RELEASE: "0.10.19", MINDDY_IMAGE: digest }), {
    name: "Version compatibility",
    state: "pass",
    detail: "release 0.10.19 uses an immutable image digest; verify its release-manifest.json before deployment.",
  });
});

test("maintenance commands remain explicit safety gates", () => {
  const options = parseMaintenanceArgs(["restore", "--backup-dir", "/tmp/backup", "--confirm-blank-target"]);
  assert.equal(options.confirmBlankTarget, true);
  assert.match(maintenanceMessage(options, { MINDDY_RELEASE: "0.10.19" }), /Restore preflight/);
  assert.throws(() => maintenanceMessage({ action: "restore", backupDir: "/tmp/backup" }, { MINDDY_RELEASE: "0.10.19" }), /confirm-blank-target/);
});
