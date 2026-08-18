import "server-only";

import { SITE_URL } from "@/lib/site";

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
