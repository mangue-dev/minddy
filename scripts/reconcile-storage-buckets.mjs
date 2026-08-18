#!/usr/bin/env node
/** MIN-379 — Storage buckets: they are not included in a SQL schema dump. */
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, "..");
const EXPECTED_BUCKETS = {
  attachments: { public: false, file_size_limit: 20 * 1024 * 1024 },
  "project-icons": { public: true, file_size_limit: 25 * 1024 * 1024 },
  "forge-attachments": { public: true, file_size_limit: 20 * 1024 * 1024 },
};

function fail(message) {
  throw new Error(`Storage configuration failed: ${message}`);
}

export function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      const next = argv[++index];
      if (!next || next.startsWith("--")) fail(`${flag} expects a value.`);
      return next;
    };
    if (flag === "--db-url") options.dbUrl = value();
    else if (flag === "--supabase-url") options.supabaseUrl = value();
    else if (flag === "--service-role-key") options.serviceRoleKey = value();
    else if (flag === "--from-bootstrap-env") options.fromBootstrapEnv = true;
    else if (flag === "--local") options.local = true;
    else if (flag === "--dry-run") options.dryRun = true;
    else fail(`unknown option: ${flag}.`);
  }
  if (options.fromBootstrapEnv) {
    options.dbUrl ??= process.env.MDY_BOOTSTRAP_DB_URL;
    options.supabaseUrl ??= process.env.MDY_BOOTSTRAP_SUPABASE_URL;
    options.serviceRoleKey ??= process.env.MDY_BOOTSTRAP_SERVICE_ROLE_KEY;
  }
  for (const key of ["supabaseUrl", "serviceRoleKey"]) {
    if (!options[key]) fail(`${key} is required.`);
  }
  return options;
}

function storageUrl(supabaseUrl, path) {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1${path}`;
}

async function storageFetch(options, path, init = {}) {
  const response = await fetch(storageUrl(options.supabaseUrl, path), {
    ...init,
    headers: { authorization: `Bearer ${options.serviceRoleKey}`, ...init.headers },
  });
  if (!response.ok) {
    const body = await response.text();
    fail(`Storage API ${init.method ?? "GET"} ${path} returned ${response.status}: ${body || response.statusText}`);
  }
  return response;
}

async function listBuckets(options) {
  const response = await storageFetch(options, "/bucket");
  const buckets = await response.json();
  if (!Array.isArray(buckets)) fail("the bucket list response is not an array.");
  return buckets;
}

function matches(bucket, expected) {
  return bucket.public === expected.public && Number(bucket.file_size_limit) === expected.file_size_limit;
}

export async function reconcileBuckets(options) {
  if (options.dryRun) {
    console.log("→ would create/configure Storage buckets and delete the inherited avatars bucket if empty.");
    return;
  }
  const current = new Map((await listBuckets(options)).map((bucket) => [bucket.id, bucket]));

  for (const [id, expected] of Object.entries(EXPECTED_BUCKETS)) {
    const bucket = current.get(id);
    if (!bucket) {
      await storageFetch(options, "/bucket", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name: id, ...expected }),
      });
      console.log(`→ bucket ${id} created.`);
    } else if (!matches(bucket, expected)) {
      await storageFetch(options, `/bucket/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(expected),
      });
      console.log(`→ bucket ${id} reconfigured.`);
    }
  }

  const byId = new Map((await listBuckets(options)).map((bucket) => [bucket.id, bucket]));
  for (const [id, expected] of Object.entries(EXPECTED_BUCKETS)) {
    const bucket = byId.get(id);
    if (!bucket || !matches(bucket, expected)) {
      fail(`bucket ${id} is missing or misconfigured after reconciliation.`);
    }
  }

  if (!byId.has("avatars")) return;
  try {
    await storageFetch(options, "/bucket/avatars", { method: "DELETE" });
    console.log("→ inherited avatars bucket deleted (unused since migration 20260903090000).");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(
      "the inherited avatars bucket probably still contains objects; do not delete it blindly. " +
        `Empty/archive it through Storage, then retry. Detail: ${detail}`
    );
  }
}

export { EXPECTED_BUCKETS, ROOT_DIR };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  reconcileBuckets(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
