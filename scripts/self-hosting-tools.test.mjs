import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  checkpointPath,
  combineFullEnvironmentTemplates,
  createEnvironmentFile,
  createSupabaseJwt,
  environmentValues,
  fullBootstrapDatabaseUrl,
  generatedValues,
  inferCapabilities,
  normalizeAppOrigin,
  normalizeImageReference,
  parseArgs as parseInstallArgs,
  parseEnvironment,
  recordCheckpoint,
  renderEnvironment,
} from "./self-hosting-install.mjs";
import { compatibilityFinding, configFindings, disabledCapabilities, forgeAccessFinding, parseArgs as parseDoctorArgs, redact } from "./self-hosting-doctor.mjs";
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
  assert.equal(parsed.AGENT_EXECUTION_BACKEND, "self-hosted");
  assert.equal(parsed.MINDDY_IMAGE, `ghcr.io/mangue-dev/minddy@sha256:${"b".repeat(64)}`);
});

test("the installer scopes generated configuration to selected useful features", () => {
  const capabilities = new Set(["application-email", "web-push", "github"]);
  const options = parseInstallArgs([
    "--non-interactive", "--mode", "managed", "--domain", "tickets.example.test",
    "--admin-email", "ops@example.test", "--supabase-url", "https://project.supabase.co",
    "--anon-key", "anon", "--service-role-key", "service",
    ...[...capabilities].flatMap((capability) => ["--enable", capability]),
  ]);
  const generated = generatedValues(options.capabilities);
  const values = environmentValues(options, generated);
  assert.equal(values.EMAIL_PROVIDER, "resend");
  assert.equal(values.AGENT_EXECUTION_BACKEND, "self-hosted");
  assert.equal(values.AGENT_RUNNER_URL, "http://agent-runner:6464");
  assert.equal(values.VAPID_SUBJECT, "mailto:ops@example.test");
  assert.ok(values.MINDDY_PUBLIC_VAPID_PUBLIC_KEY);
  assert.ok(values.VAPID_PRIVATE_KEY);
  assert.ok(values.GIT_STATE_SECRET);
  assert.ok(values.CRON_SECRET);
  assert.ok(values.AGENT_RUNNER_SECRET);
  assert.deepEqual([...inferCapabilities(values)].sort(), [...capabilities].sort());
  assert.throws(() => parseInstallArgs(["--enable", "posthog"]), /unknown optional capability/);
});

test("a private server uses its LAN origin without requesting a domain", () => {
  const options = parseInstallArgs([
    "--non-interactive",
    "--mode", "managed",
    "--app-url", "http://192.168.1.50",
    "--admin-email", "ops@example.test",
    "--supabase-url", "https://project.supabase.co",
    "--anon-key", "anon-key",
    "--service-role-key", "service-role-key",
  ]);
  const values = environmentValues(options);
  assert.equal(values.MINDDY_HOST, "192.168.1.50");
  assert.equal(values.MINDDY_SITE_ADDRESS, "http://192.168.1.50");
  assert.equal(values.MINDDY_PUBLIC_APP_URL, "http://192.168.1.50");
  assert.equal(normalizeAppOrigin("https://tickets.example.test/"), "https://tickets.example.test");
  assert.throws(() => normalizeAppOrigin("http://203.0.113.20"), /must use HTTPS/);
});

test("the complete local Supabase stack uses a dedicated private LAN port", () => {
  const values = environmentValues(parseInstallArgs([
    "--non-interactive",
    "--mode", "full",
    "--app-url", "http://10.0.0.8",
    "--admin-email", "ops@example.test",
    "--supabase-dir", "/srv/minddy/supabase",
  ]));
  assert.equal(values.MINDDY_PUBLIC_APP_URL, "http://10.0.0.8");
  assert.equal(values.MINDDY_PUBLIC_SUPABASE_URL, "http://10.0.0.8:8000");
  assert.equal(values.SUPABASE_SITE_ADDRESS, "http://10.0.0.8:8000");
  assert.equal(values.MINDDY_SUPABASE_HTTP_BIND_ADDRESS, "0.0.0.0");
  assert.equal(values.MINDDY_SUPABASE_HTTP_PORT, "8000");
});

test("the complete public Supabase stack keeps its API port on loopback", () => {
  const values = environmentValues(parseInstallArgs([
    "--non-interactive",
    "--mode", "full",
    "--app-url", "https://tickets.example.test",
    "--admin-email", "ops@example.test",
    "--supabase-host", "supabase.example.test",
    "--supabase-dir", "/srv/minddy/supabase",
  ]));
  assert.equal(values.MINDDY_PUBLIC_SUPABASE_URL, "https://supabase.example.test");
  assert.equal(values.SUPABASE_SITE_ADDRESS, "supabase.example.test");
  assert.equal(values.MINDDY_SUPABASE_HTTP_BIND_ADDRESS, "127.0.0.1");
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

test("the complete profile includes upstream defaults and derives a loopback bootstrap URL", () => {
  const template = combineFullEnvironmentTemplates(
    "POSTGRES_HOST=db\nPOSTGRES_DB=postgres\n",
    "MINDDY_HOST=tickets.example.com\nMINDDY_POSTGRES_BIND_PORT=54322\n",
  );
  assert.match(template, /POSTGRES_HOST=db/);
  assert.match(template, /MINDDY_HOST=tickets\.example\.com/);
  assert.equal(
    fullBootstrapDatabaseUrl({ POSTGRES_PASSWORD: "secret/with?symbols", MINDDY_POSTGRES_BIND_PORT: "55432" }),
    "postgresql://postgres:secret%2Fwith%3Fsymbols@127.0.0.1:55432/postgres",
  );
});

test("the doctor reports only keys and redacts connection passwords", () => {
  assert.deepEqual(configFindings({ MINDDY_HOST: "host" }), [
    "MINDDY_PUBLIC_APP_URL", "MINDDY_PUBLIC_SUPABASE_URL", "MINDDY_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_EMAILS",
    "AGENT_EXECUTION_BACKEND", "AGENT_RUNNER_URL", "AGENT_RUNNER_SECRET", "CRON_SECRET",
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

test("the doctor names the forge access mode: relay, operator-owned app, or disabled", () => {
  const relay = {
    MINDDY_FORGE_RELAY_URL: "https://forge-relay.minddy.app",
    MINDDY_FORGE_RELAY_INSTANCE_ID: "instance-id",
    MINDDY_FORGE_RELAY_SECRET: "instance-secret",
    MINDDY_FORGE_RELAY_WEBHOOK_SECRET: "x".repeat(32),
    GIT_STATE_SECRET: "state-secret",
  };
  assert.equal(forgeAccessFinding(relay).detail, "managed forge relay (github, gitlab); no operator-owned app variables are read.");
  assert.equal(
    forgeAccessFinding({ ...relay, GITHUB_APP_ID: "1", GITHUB_APP_SLUG: "app", GITHUB_APP_PRIVATE_KEY: "key" }).detail,
    "operator-owned app (GitHub).",
  );
  assert.equal(forgeAccessFinding({}).detail, "disabled: no operator-owned forge app and no managed forge relay.");
  assert.equal(forgeAccessFinding({ MINDDY_FORGE_RELAY_URL: "https://forge-relay.minddy.app" }).detail, "forge relay configuration is incomplete; forge integrations stay disabled.");
  assert.equal(forgeAccessFinding({ ...relay, GIT_STATE_SECRET: "" }).state, "fail");
  assert.equal(
    forgeAccessFinding({ ...relay, MINDDY_FORGE_RELAY_WEBHOOK_SECRET: "short" }).state,
    "fail",
  );
  assert.equal(
    forgeAccessFinding({ ...relay, MINDDY_FORGE_RELAY_WEBHOOK_SECRET: "x".repeat(32) }).detail,
    "managed forge relay (github, gitlab); no operator-owned app variables are read.",
  );
});
