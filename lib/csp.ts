/**
 * The script policy minddy is moving to (MIN-999), sent in REPORT-ONLY mode
 * by `proxy.ts` on every document it renders. Browsers report what the policy
 * would block to `CSP_REPORT_PATH` and block nothing; enforcement waits until
 * those reports are clean.
 *
 * - `script-src` trusts scripts carrying the per-request nonce and, through
 *   `'strict-dynamic'`, what they load. Next reads the nonce from the request
 *   header the proxy sets and stamps its own scripts; the pre-paint scripts
 *   take it from the root layout. `https:` and `'unsafe-inline'` are ignored
 *   by browsers that understand nonces and only keep older ones working.
 * - `require-trusted-types-for 'script'` reports every string that reaches an
 *   HTML or script sink. Next ships its own `nextjs` policy for its chunks.
 * - The root layout is `force-dynamic`, so every rendered page already runs
 *   per request: the nonce makes no static page dynamic. The public pages
 *   that Vercel's CDN caches (`next.config.mjs` headers) are the exception:
 *   their cached HTML would carry the nonce of the render that filled the
 *   cache while each response names a fresh one. They get no nonce and a
 *   policy without `script-src` (`isCdnCachedDocument`).
 *
 * Plugin content and `<base>` are already enforced by the static policy in
 * `next.config.mjs`; they are repeated here so the report-only policy stands
 * on its own once it replaces that one.
 */

import { documentationRoots } from "@/lib/documentation-core.mjs";
import { PUBLIC_ROUTE_PATHS } from "@/lib/public-routes";

export const CSP_REPORT_PATH = "/api/csp-report";
export const CSP_REPORT_GROUP = "csp";

/** Request header carrying the nonce to the root layout. */
export const CSP_NONCE_HEADER = "x-minddy-nonce";

/** 128 random bits, base64: unguessable and unique per request. */
export function createCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

const DOCUMENTATION_ROOTS: readonly string[] = Object.values(documentationRoots);

/**
 * A public page whose HTML the CDN caches: the marketing routes in every
 * locale, and the documentation roots with their articles. Mirrors the
 * cache-header sources of `next.config.mjs`.
 */
export function isCdnCachedDocument(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (PUBLIC_ROUTE_PATHS.has(path)) return true;
  return DOCUMENTATION_ROOTS.some((root) =>
    path === root || (path.startsWith(`${root}/`) && !path.slice(root.length + 1).includes("/")),
  );
}

/**
 * The report-only policy. Without a nonce (a CDN-cached page), `script-src`
 * is left out and only Trusted Types and the plugin and `<base>` rules are
 * reported.
 */
export function reportOnlyScriptPolicy(nonce: string | null, { dev = false } = {}): string {
  return [
    // React needs eval in development for its debugging features only.
    ...(nonce ? [`script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`] : []),
    "object-src 'none'",
    "base-uri 'self'",
    "require-trusted-types-for 'script'",
    `report-to ${CSP_REPORT_GROUP}`,
    // Firefox and older Safari only know the legacy directive.
    `report-uri ${CSP_REPORT_PATH}`,
  ].join("; ");
}

/** `Reporting-Endpoints` value that names the `report-to` group. */
export const REPORTING_ENDPOINTS = `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`;
