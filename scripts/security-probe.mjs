#!/usr/bin/env node
/**
 * Manual, live negative authorization probe for a separately provisioned
 * Supabase fixture. It deliberately uses only the public anon key and user
 * access tokens; never provide a service-role key to this script.
 */
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const REQUIRED_ENVIRONMENT = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SECURITY_PROBE_CROSS_TENANT_TOKEN",
  "SECURITY_PROBE_DUAL_MEMBER_TOKEN",
  "SECURITY_PROBE_SOURCE_PROJECT_ID",
  "SECURITY_PROBE_FOREIGN_PROJECT_ID",
  "SECURITY_PROBE_FOREIGN_ISSUE_ID",
  "SECURITY_PROBE_REASSIGNABLE_ISSUE_ID",
  "SECURITY_PROBE_HARD_DELETE_PAGE_ID",
  "SECURITY_PROBE_SECRET_CONNECTION_ID",
  "SECURITY_PROBE_FOREIGN_STORAGE_PATH",
];

function fail(message) {
  throw new Error(`Security probe failed: ${message}`);
}

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) fail(`${name} is required.`);
  return value;
}

function requiredUuid(environment, name) {
  const value = required(environment, name);
  if (!UUID_PATTERN.test(value)) fail(`${name} must be a UUID.`);
  return value;
}

function normalizedSupabaseUrl(environment) {
  const value = required(environment, "SUPABASE_URL");
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("SUPABASE_URL must be an absolute URL.");
  }
  if (url.username || url.password || !url.hostname) {
    fail("SUPABASE_URL must not contain credentials.");
  }
  const isLocalHttp =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
    environment.SECURITY_PROBE_ALLOW_INSECURE_LOCAL === "true";
  if (url.protocol !== "https:" && !isLocalHttp) {
    fail("SUPABASE_URL must use HTTPS (or explicitly allow local HTTP).");
  }
  return url.toString().replace(/\/$/, "");
}

export function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--confirm") return { confirmed: true };
  fail("pass --confirm to run this live probe.");
}

export function readConfig(environment = process.env, { confirmed = false } = {}) {
  if (!confirmed) fail("pass --confirm to run this live probe.");
  const config = {
    supabaseUrl: normalizedSupabaseUrl(environment),
    anonKey: required(environment, "SUPABASE_ANON_KEY"),
    crossTenantToken: required(environment, "SECURITY_PROBE_CROSS_TENANT_TOKEN"),
    dualMemberToken: required(environment, "SECURITY_PROBE_DUAL_MEMBER_TOKEN"),
    sourceProjectId: requiredUuid(environment, "SECURITY_PROBE_SOURCE_PROJECT_ID"),
    foreignProjectId: requiredUuid(environment, "SECURITY_PROBE_FOREIGN_PROJECT_ID"),
    foreignIssueId: requiredUuid(environment, "SECURITY_PROBE_FOREIGN_ISSUE_ID"),
    reassignableIssueId: requiredUuid(environment, "SECURITY_PROBE_REASSIGNABLE_ISSUE_ID"),
    hardDeletePageId: requiredUuid(environment, "SECURITY_PROBE_HARD_DELETE_PAGE_ID"),
    secretConnectionId: requiredUuid(environment, "SECURITY_PROBE_SECRET_CONNECTION_ID"),
    foreignStoragePath: required(environment, "SECURITY_PROBE_FOREIGN_STORAGE_PATH"),
  };
  if (config.sourceProjectId === config.foreignProjectId) {
    fail("source and foreign project fixtures must be different.");
  }
  const requiredPrefix = `projects/${config.foreignProjectId}/`;
  if (
    !config.foreignStoragePath.startsWith(requiredPrefix) ||
    config.foreignStoragePath.includes("..") ||
    config.foreignStoragePath.endsWith("/")
  ) {
    fail(`SECURITY_PROBE_FOREIGN_STORAGE_PATH must be a file below ${requiredPrefix}.`);
  }
  return config;
}

function headers(config, token, headers = {}) {
  return {
    apikey: config.anonKey,
    authorization: `Bearer ${token}`,
    ...headers,
  };
}

function request(config, fetchImpl, token, path, init = {}) {
  return fetchImpl(`${config.supabaseUrl}${path}`, {
    ...init,
    headers: headers(config, token, init.headers),
    redirect: "error",
  });
}

async function json(response, label) {
  try {
    return await response.json();
  } catch {
    fail(`${label} returned ${response.status} without a JSON response.`);
  }
}

async function expectInvisible(response, label) {
  if ([401, 403].includes(response.status)) return;
  if (!response.ok) fail(`${label} returned ${response.status}.`);
  const body = await json(response, label);
  if (!Array.isArray(body) || body.length !== 0) fail(`${label} exposed a row.`);
}

async function expectNoAffectedRows(response, label) {
  if ([401, 403].includes(response.status)) return;
  if (!response.ok) fail(`${label} returned ${response.status}.`);
  const body = await json(response, label);
  if (!Array.isArray(body) || body.length !== 0) fail(`${label} changed a row.`);
}

async function expectDenied(response, label, acceptedStatuses = [401, 403]) {
  if (!acceptedStatuses.includes(response.status)) fail(`${label} was not denied (returned ${response.status}).`);
  await response.body?.cancel();
}

async function expectVisibleFixture(response, label, id, projectId) {
  if (!response.ok) fail(`${label} fixture could not be read (returned ${response.status}).`);
  const body = await json(response, label);
  if (!Array.isArray(body) || body.length !== 1 || body[0].id !== id || body[0].project_id !== projectId) {
    fail(`${label} fixture does not match its documented project.`);
  }
}

function restPath(table, id, select) {
  return `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=${encodeURIComponent(select)}`;
}

export async function runProbe(config, { fetchImpl = fetch, log = console.log } = {}) {
  const crossToken = config.crossTenantToken;
  const dualToken = config.dualMemberToken;

  await expectInvisible(
    await request(config, fetchImpl, crossToken, restPath("issues", config.foreignIssueId, "id")),
    "cross-tenant issue read",
  );
  log("✓ Cross-tenant issue read is blocked.");

  await expectNoAffectedRows(
    await request(config, fetchImpl, crossToken, restPath("issues", config.foreignIssueId, "id"), {
      method: "PATCH",
      headers: { "content-type": "application/json", prefer: "return=representation" },
      body: JSON.stringify({ description: "SECURITY_PROBE_UNAUTHORIZED_WRITE" }),
    }),
    "cross-tenant issue write",
  );
  log("✓ Cross-tenant issue write is blocked.");

  await expectDenied(
    await request(config, fetchImpl, crossToken, "/rest/v1/rpc/get_admin_user_totals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ p_tz: "UTC" }),
    }),
    "privileged RPC execution",
  );
  log("✓ Privileged RPC execution is blocked.");

  const secretFixturePath = `${restPath("git_connections", config.secretConnectionId, "id")}`;
  const secretFixture = await request(config, fetchImpl, crossToken, secretFixturePath);
  if (!secretFixture.ok) fail(`secret-column fixture could not be read (returned ${secretFixture.status}).`);
  const fixtureRows = await json(secretFixture, "secret-column fixture read");
  if (!Array.isArray(fixtureRows) || fixtureRows.length !== 1 || fixtureRows[0].id !== config.secretConnectionId) {
    fail("secret-column fixture must belong to the cross-tenant probe user.");
  }
  await expectDenied(
    await request(
      config,
      fetchImpl,
      crossToken,
      restPath("git_connections", config.secretConnectionId, "access_token_encrypted"),
    ),
    "secret-column access",
  );
  log("✓ Secret-column access is blocked.");

  await expectInvisible(
    await request(config, fetchImpl, crossToken, "/storage/v1/object/list/attachments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefix: config.foreignStoragePath }),
    }),
    "foreign Storage listing",
  );
  log("✓ Foreign Storage listing is blocked.");

  const foreignUploadPath = `projects/${config.foreignProjectId}/security-probe/unauthorized-${randomUUID()}.txt`;
  await expectDenied(
    await request(config, fetchImpl, crossToken, `/storage/v1/object/attachments/${foreignUploadPath}`, {
      method: "POST",
      headers: { "content-type": "text/plain", "x-upsert": "false" },
      body: "security-probe",
    }),
    "foreign Storage upload",
    [400, 401, 403],
  );
  log("✓ Foreign Storage upload is blocked.");

  await expectVisibleFixture(
    await request(config, fetchImpl, dualToken, restPath("issues", config.reassignableIssueId, "id,project_id")),
    "project reassignment",
    config.reassignableIssueId,
    config.sourceProjectId,
  );
  await expectDenied(
    await request(config, fetchImpl, dualToken, restPath("issues", config.reassignableIssueId, "id"), {
      method: "PATCH",
      headers: { "content-type": "application/json", prefer: "return=representation" },
      body: JSON.stringify({ project_id: config.foreignProjectId }),
    }),
    "project reassignment",
  );
  await expectVisibleFixture(
    await request(config, fetchImpl, dualToken, restPath("issues", config.reassignableIssueId, "id,project_id")),
    "project reassignment after denial",
    config.reassignableIssueId,
    config.sourceProjectId,
  );
  log("✓ Project reassignment is blocked.");

  await expectVisibleFixture(
    await request(config, fetchImpl, dualToken, restPath("pages", config.hardDeletePageId, "id,project_id")),
    "hard-delete",
    config.hardDeletePageId,
    config.sourceProjectId,
  );
  await expectNoAffectedRows(
    await request(config, fetchImpl, dualToken, restPath("pages", config.hardDeletePageId, "id"), {
      method: "DELETE",
      headers: { prefer: "return=representation" },
    }),
    "hard-delete",
  );
  await expectVisibleFixture(
    await request(config, fetchImpl, dualToken, restPath("pages", config.hardDeletePageId, "id,project_id")),
    "hard-delete after denial",
    config.hardDeletePageId,
    config.sourceProjectId,
  );
  log("✓ Hard delete is blocked.");
  log("Security probe passed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    await runProbe(readConfig(process.env, options));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Security probe failed.");
    process.exitCode = 1;
  }
}
