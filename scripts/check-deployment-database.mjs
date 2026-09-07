#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const REQUIRED_RPC_PATHS = [
  "/rpc/auth_authorization_state",
  "/rpc/resolve_realtime_topic",
];

/**
 * Check the target schema before Vercel can replace a working deployment.
 * @param {Record<string, string | undefined>} env
 */
export async function checkDeploymentDatabase(env = process.env, fetcher = fetch) {
  const baseUrl = env.MINDDY_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!baseUrl || !serviceKey) {
    throw new Error(
      "Database preflight requires MINDDY_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Database preflight requires an HTTP(S) URL without credentials.");
  }
  url.pathname = `${url.pathname.replace(/\/$/, "")}/rest/v1/`;
  url.search = "";
  url.hash = "";

  let schema;
  try {
    // PostgREST's role-filtered OpenAPI schema is read-only. Never invoke
    // application RPCs or inspect account data during a deployment build.
    const response = await fetcher(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/openapi+json",
      },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) throw new Error();
    schema = await response.json();
  } catch {
    // Upstream responses and network errors can include deployment secrets.
    throw new Error("Database preflight could not read the target PostgREST schema.");
  }

  const missing = REQUIRED_RPC_PATHS.filter((path) => !schema?.paths?.[path]?.post);
  if (missing.length > 0) {
    throw new Error(
      `Database preflight failed: missing required RPCs: ${missing.join(", ")}. ` +
      "Review and apply the candidate's database migrations before retrying this deployment. " +
      "If preview shares a production database, coordinate the database upgrade with production first. " +
      "See docs/preview-database-compatibility.md.",
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkDeploymentDatabase().then(
    () => console.log("Database preflight passed: required auth and Realtime RPCs are available."),
    (error) => {
      console.error(error.message);
      process.exitCode = 1;
    },
  );
}
