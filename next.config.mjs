import path from "node:path";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";
import { commitsSinceVersion } from "./scripts/commits-since-version.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * French slug redirects (MIN-88). Under `/fr`, only translated slugs
 * exist: `/fr/pricing` is not a valid second URL for the page
 * prices, that's an error — and two URLs for a page is exactly what
 * `canonical` and `hreflang` spend their time untangling.
 *
 * **Kept in line with `lib/public-routes.ts` by `lib/public-routes.test.ts`**:
 * a `.mjs` file cannot import the TypeScript table, so the list is
 * copied here and the test fails if the two diverge.
 */
export const FRENCH_SLUG_REDIRECTS = [
  { source: "/fr/pricing", destination: "/fr/tarifs" },
  { source: "/fr/self-hosting", destination: "/fr/auto-hebergement" },
  {
    source: "/fr/self-hosting/install",
    destination: "/fr/auto-hebergement/installer",
  },
  { source: "/fr/download", destination: "/fr/telecharger" },
  { source: "/fr/changelog", destination: "/fr/nouveautes" },
  { source: "/fr/legal", destination: "/fr/mentions-legales" },
  { source: "/fr/terms", destination: "/fr/cgu" },
  { source: "/fr/privacy", destination: "/fr/confidentialite" },
];

/**
 * All public URLs, EN and FR — same copy, same test of
 * non-divergence. They are used here to set the CDN cache header (see
 * `headers()`).
 */
export const PUBLIC_ROUTE_PATHS = [
  "/",
  "/pricing",
  "/mcp",
  "/self-hosting",
  "/self-hosting/install",
  "/download",
  "/changelog",
  "/alternatives/linear",
  "/alternatives/jira",
  "/alternatives/notion",
  "/legal",
  "/terms",
  "/privacy",
  "/cookies",
  "/fr",
  "/fr/tarifs",
  "/fr/mcp",
  "/fr/auto-hebergement",
  "/fr/auto-hebergement/installer",
  "/fr/telecharger",
  "/fr/nouveautes",
  "/fr/alternatives/linear",
  "/fr/alternatives/jira",
  "/fr/alternatives/notion",
  "/fr/mentions-legales",
  "/fr/cgu",
  "/fr/confidentialite",
  "/fr/cookies",
];

/**
 * Hosts that serve minddy itself, as a regular expression — the form
 * that `has: [{ type: "host" }]` expects from an entry of `headers()` (compared
 * anchored, port removed, lowercase).
 *
 * It exists to BOUND the CDN cache of public pages to these hosts
 * (MIN-337). On a client domain, `/` serves a personalized feedback board
 * per cookie: it fell under the same header, without `Vary`, and the CDN could
 * serve one visitor another's page.
 *
 * Voluntarily more narrow that `isPrimaryHost` (lib/public-hosts.ts), which
 * accepts all `*.minddy.app`: a minddy subdomain serving the app one day
 * would only have the cache less here, when the opposite — a client domain which
 * would pass the grid — is the default that we correct. `feedback.minddy.app`, the
 * domain of dogfooding, is precisely a `*.minddy.app` which is NOT primary.
 * `lib/public-routes.test.ts` keeps the two in phase.
 */
export const PRIMARY_HOST_PATTERN =
  "(?:www\\.|preview\\.)?minddy\\.app|localhost|[a-z0-9-]+\\.vercel\\.app";

/** On Vercel, excluding production (preview, branch deploys). Not locally. */
const isVercelNonProduction =
  !!process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit Next's traced production server for self-hosted container builds. Vercel
  // packages functions through its adapter; combining its adapter with Next 16.3's
  // standalone finalizer omits the root trace manifest that the finalizer expects.
  output: process.env.VERCEL === "1" ? undefined : "standalone",
  // Pin the workspace root to this app so Turbopack doesn't walk up into the
  // sibling mangue-ui monorepo (mangue-ui is a `file:` dependency).
  turbopack: { root: dir },
  // mangue-ui ships TS/TSX source (no build) — Next must transpile it.
  transpilePackages: ["mangue-ui"],
  // `radix-ui` is a barrel on all Radix primitives, and it is through it that
  // mango-ui components import them (`import { Dialog } from
  // "radix-ui"`). Next rewrites these named imports to the module that exports them
  // really, instead of evaluating the whole barrel (MIN-100).
  //
  // The same setting can NOTHING for the mango-ui barrel: the rewrite has
  // need subpaths, and the package's `exports` field doesn't post any.
  // The alias `mangue-ui/*` of `tsconfig.json` takes care of this — see the
  // comment there, it carries the measure.
  experimental: {
    optimizePackageImports: ["radix-ui"],
  },
  /**
 * Runtime files of the repository, embedded in the functions.
 *
 * The agent bundle and Markdown projection are produced by `prebuild`; the
 * product knowledge is versioned Markdown. All are read by path at runtime.
 * Next's tracer tracks imports, not arbitrary file reads, so these patterns
 * keep them in the deployed function.
 *
 * `.agent-vm/` (MIN-224) — the microVM harness, written to the VM at
 * startup of each round. Absent, each `loop_in_vm` run fails on a
 * ENOENT. The pattern covers all API routes: the harness is written from
 * the LAUNCH path as well as from the drain CRON, and listing both at the
 * main would cause a third caller, someday, to discover the problem in
 * production.
 *
 * `.pages-md/` (MIN-295) — the markdown projection of the pages, output of the bundler
 * of Next because it substitutes `typeof window` → `"undefined"` and
 * thus reduces `elementFromString` of tiptap to one `throw` unconditional (see
 * scripts/build-pages-md.mjs, which carries the measure). Here the pattern is `/**`, and
 * not `/api/**`: the projection is called from API routes, but also
 * from page export, search and server actions — that is,
 * from page routes. Restricting the pattern would amount to keeping this
 * list by hand, to save a file that Vercel pools in any way
 * between traces.
 *
 * `content/knowledge/` — the articles Numo retrieves with `get_help`. They are
 * intentionally outside the source graph so product updates stay Markdown-only.
 */
  outputFileTracingIncludes: {
    "/api/**": [".agent-vm/**", "content/knowledge/**"],
    "/**": [".pages-md/**"],
  },
  // Bridge Vercel's server-only VERCEL_ENV into a public var so client
  // components (e.g. the sidebar env badge) can tell prod/preview/local apart.
  // Unset locally → "development". Inlined at build time.
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "development",
    // The SHA of the commit that produced THIS bundle (MIN-157). Server-only at
    // Vercel like VERCEL_ENV, therefore bridged here — and inlined to the build, which is
    // exactly the point: the constant remains that of the version loaded in
    // the tab, when /api/version responds, that of the deployment which is used
    // traffic. Empty locally (and if “Automatically expose System Environment
    // Variables » is unchecked) → detection turns off by itself.
    NEXT_PUBLIC_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    // The number of commits between the current version tag and the commit
    // built — the number displayed behind the version number (0.8.9-3).
    // Measured HERE because this is the only time the repository is there: runtime
    // Vercel sees neither `.git` nor the history. See the module for measurement,
    // and for the `VERCEL_DEEP_CLONE=1` that she requests from Vercel.
    NEXT_PUBLIC_VERSION_COMMITS: String(commitsSinceVersion()),
  },
  // Local test of custom domains (MIN-36): hosts /etc/hosts pointed
  // on 127.0.0.1 — otherwise `next dev` blocks cross-origin requests
  // (server actions, assets) venant d'un host non-localhost.
  allowedDevOrigins: ["board.minddy.test", "view.minddy.test"],
  async redirects() {
    return [
      // The "Mes tickets" tabs merged into the tickets board as a system view —
      // old routes land there with it pre-selected (?view=my; extra query params
      // like ?issue= are preserved). Temporary (307): don't let browsers cache it.
      { source: "/my", destination: "/all?view=my", permanent: false },
      {
        source: "/projects/:id/my",
        destination: "/projects/:id?view=my",
        permanent: false,
      },
      ...FRENCH_SLUG_REDIRECTS.map((rule) => ({ ...rule, permanent: true })),
    ];
  },
  async headers() {
    const headers = [];

    // Security headers, all routes (MIN-118). HSTS is only valid on one
    // HTTPS response — harmless in dev, and the HTTP→HTTPS redirection is
    // native Vercel. `preload` is in the header but the domain is NOT
    // submitted to hstspreload.org (almost irreversible). The CSP is limited to
    // `frame-ancestors`/`base-uri`/`form-action`: a `script-src` with nonces
    // would require rewriting the render string (inline scripts Next +
    // theme-init-script) — separate site if desired. Microphone authorized in
    // self: the assistant's dictation uses it.
    const securityHeaders = (csp) => [
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(self), geolocation=()",
      },
      { key: "Content-Security-Policy", value: csp },
    ];

    const BASE_CSP = "frame-ancestors 'none'; base-uri 'self'";

    // ⚠ `/oauth/authorize` is EXCLUDED from this entry (only one CSP header per
    // answer: two accumulate in intersection, the strictest would win).
    // The exclusion is anchored on `/` or the end — otherwise a future route in
    // `/oauth/authorize-…` would silently exit ALL these headers.
    headers.push({
      source: "/((?!oauth/authorize(?:/|$)).*)",
      headers: securityHeaders(`${BASE_CSP}; form-action 'self'`),
    });

    // The OAuth consent screen, and it alone, without `form-action`.
    //
    // Son formulaire (components/oauth/consent-card.tsx) POSTe vers
    // /api/oauth/authorize, which responds 303 to the `redirect_uri` of the MCP client
    // — so towards claude.ai, a localhost, or an application schema: a target
    // cross-origin BY CONSTRUCTION. Or Chrome and Safari apply
    // `form-action` to the target of the REDIRECTION which follows a form POST
    // (Firefox no — behavior is not specified). `form-action 'self'`
    // here would therefore block the return to the client on two browsers out of three,
    // that is to say the entire OAuth flow of the MCP, the only access route from the
    // removal of `mdyk_` keys. The rest of the CSP is identical.
    headers.push({
      source: "/oauth/authorize",
      headers: securityHeaders(BASE_CSP),
    });

    // The push notification service worker (MIN-183).
    //
    // `Content-Type`: served from `public/`, he already has it — but a service
    // worker refused due to MIME type fails to register, without
    // possible recourse on the client side. We ask it explicitly.
    //
    // `Cache-Control`: the browser re-downloads `/sw.js` to compare the
    // bytes and decide if there is a new version. A cached worker
    // is a worker that never updates.
    //
    // ⚠ ESPECIALLY NO `Content-Security-Policy` here, despite what the
    // Next's PWA guide: the catch-all entry above is ALREADY one on
    // `/sw.js`, and two CSP headers on the same response accumulate in
    // intersection — the strictest wins, on each directive. It's the same
    // trap that `/oauth/authorize` higher up, in the other direction.
    headers.push({
      source: "/sw.js",
      headers: [
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      ],
    });

    // Public pages, in their two languages. Recopied from
    // `lib/public-routes.ts` faute de pouvoir importer du TypeScript ici —
    // `lib/public-routes.test.ts` checks that they do not diverge.
    //
    // They responded `cache-control: private, no-cache, no-store` with
    // `x-vercel-cache: MISS` on EVERY call, because the landing was calling
    // `auth.getUser()` when rendered. This bounce is passed into the proxy (which
    // executes before the cache), nothing in these pages depends on a
    // cookie: the CDN can finally serve them.
    //
    // No `Vary: Cookie`: on the Vercel CDN it would drop the rate of
    // hit to zero (each combination of cookies becomes an entry), i.e.
    // exactly the opposite of what we are looking for. The language is carried by the URL
    // and not by a cookie from the localized URLs, and the session is
    // processed by the middleware — nothing remains to vary.
    //
    // ⚠ WHY TWO HEADERS, and not just `Cache-Control`.
    //
    // These pages are dynamically rendered (they read `headers()` to
    // resolve the locale), and Next sets HIMSELF `Cache-Control: private,
    // no-cache, no-store` on the response of a dynamic rendering. On Vercel, the
    // headers in this file are applied by the router BEFORE invoking
    // the function: this then overwrites `Cache-Control`. Measured on production
    // on first deployment — `private, no-store` and `x-vercel-cache: MISS`,
    // while `next start` locally gave the value here. (THE
    // `X-Robots-Tag` lower down works: Next never sets it, so
    // no one overwrites it.)
    //
    // `Vercel-CDN-Cache-Control` is the header intended for this case: it does not drive
    // THAT the cache of Vercel's Edge Network, Next does not touch it, and it is
    // removed from the response before it reaches the browser. We keep
    // `Cache-Control` next to it: it stays just outside Vercel (and locally), and
    // the browser will continue to receive the `private, no-store` from Next
    // — which is very good, we want a shared CDN cache, not a cache
    // browser that would freeze the page of a visitor who has just connected.
    //
    // ⚠ `has: host` — these headers are ONLY valid on minddy hosts.
    //
    // A custom domain (MIN-36) serves at its root as a feedback board or
    // a shared view, that is to say a personalized page per cookie. Without
    // this condition, the client's `/` fell below the line above: set
    // cache by the CDN, without `Vary`, therefore served to whoever passes next (MIN-337).
    // The proxy also sets `no-store` on any response from a client domain.
    headers.push(
      ...PUBLIC_ROUTE_PATHS.map((source) => ({
        source,
        has: [{ type: "host", value: PRIMARY_HOST_PATTERN }],
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
          },
          {
            key: "Vercel-CDN-Cache-Control",
            value: "max-age=300, stale-while-revalidate=86400",
          },
        ],
      })),
    );

    // Preview and branch deploys: a complete, duplicate site that responded
    // so far `Allow: /` to `preview.minddy.app/robots.txt` (MIN-88). THE
    // robots.txt only protects DISCOVERY: a URL already known to a
    // crawler is visited anyway, and only this header prevents it
    // to land in the index — where it would compete with the real one.
    if (isVercelNonProduction) {
      headers.push({
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      });
    }

    return headers;
  },
};

export default withNextIntl(nextConfig);
