import "server-only";

import { SITE_URL } from "@/lib/site";
import { DESKTOP_PREVIEW_ORIGIN } from "@/lib/desktop/config";

/**
 * The CANONICAL origin of the app, derived from the environment — never from a
 * request header.
 *
 * This is the same rule as the OAuth issuer, and for the same reason: a `Host` or
 * a `X-Forwarded-Host` is a value that the CALLER chooses. Any link that we
 * creates on it goes to a domain that we have not decided on — and when this link
 * carries a token (invitation, confirmation), the token goes with it. Simply
 * trigger sending with the correct header so that the legitimate e-mail, sent
 * by us, under our name, leads to the attacker (MIN-351).
 *
 * Four cases, in this order:
 * - Vercel production — the domain canonical, whatever the alias borrowed;
 * - preview Vercel — the URL of the deployment, so that a preview remains there;
 * - self-hosted production — the canonical domain configured by the operator;
 * - dev station — the localhost of the server.
 *
 * `SITE_URL` carries the configured public origin, but a Vercel preview replaces it with its deployment URL (see `lib/server/agent/origin.ts`).
 */
export interface AppOriginEnvironment {
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
  NODE_ENV?: string;
  PORT?: string;
}

export function resolveCanonicalAppOrigin(
  env: AppOriginEnvironment,
  siteUrl: string,
): string {
  if (env.VERCEL_ENV?.trim() === "production") return siteUrl;

  const vercelUrl = env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;

  if (env.NODE_ENV === "production") return siteUrl;

  return `http://localhost:${env.PORT?.trim() || "3000"}`;
}

export function canonicalAppOrigin(): string {
  return resolveCanonicalAppOrigin(process.env, SITE_URL);
}

/**
 * The STABLE origin every OAuth round trip must be anchored to.
 *
 * OAuth is registered, not discovered: a DCR client (Notion, PostHog…) binds
 * its `redirect_uris` at registration, a hand-configured provider app lists
 * our callback once, and our own issuer/resource metadata is cached by
 * clients. All of that breaks when the origin moves — and
 * `resolveCanonicalAppOrigin` deliberately moves on every Vercel preview
 * deployment so that a preview stays on itself (invitation links). So OAuth
 * does not follow it: production keeps the canonical domain, and the main
 * preview keeps `preview.minddy.app` — the fixed alias the desktop preview
 * channel already loads — whatever deployment currently serves it. A PR
 * preview (or a dev station) falls back to its own origin, which stays
 * self-consistent within one deployment: registration and authorization
 * always agree, only the persistence across deployments is best-effort.
 */
export function resolveOauthAppOrigin(
  env: AppOriginEnvironment & { VERCEL_GIT_COMMIT_REF?: string },
  siteUrl: string,
): string {
  const vercelEnv = env.VERCEL_ENV?.trim();
  if (vercelEnv && vercelEnv !== "production" &&
      env.VERCEL_GIT_COMMIT_REF?.trim() === "main")
    return DESKTOP_PREVIEW_ORIGIN;
  return resolveCanonicalAppOrigin(env, siteUrl);
}

export function oauthAppOrigin(): string {
  return resolveOauthAppOrigin(process.env, SITE_URL);
}
