import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  lookupCustomDomain,
  lookupTokenProject,
  type DomainTarget,
  type PublicTokenKind,
} from "@/lib/custom-domain-lookup";
import { isPrimaryHost, normalizeHost } from "@/lib/public-hosts";
import { detectFromAcceptLanguage } from "@/lib/accept-language";
import {
  PUBLIC_ROUTE_PATHS,
  englishPathForFrench,
  routeByPath,
} from "@/lib/public-routes";
import { isProtectedPath } from "@/lib/protected-prefixes";
import { decodeJwtPayload, needsMfaChallenge } from "@/lib/mfa";
import {
  ACCOUNT_THEME_HEADER,
  resolveAccountTheme,
} from "@/lib/account-theme";
import { createCookieSink, SESSION_COOKIE_OPTIONS } from "@/lib/session-cookies";

/**
 * Next 16 middleware (named `proxy`). It does four things: route custom domains, resolve the language of public URLs, keep app routes behind a session, and keep crawlers out of anything that doesn't look at them.
 *
 * What requires a session lives in `lib/protected-prefixes.ts` (BLACK list):
 * everything that is not there falls into the Next rendering, and therefore in 404 if there is
 * no route. See this file for the reason for the inversion.
 *
 * API aside: `/api/` authenticates on its own (401 JSON, never a
 * HTML redirect to /login), so the matcher excludes it.
 */

/**
 * Public routes outside the marketing site: they do not have a localized version
 * and do not carry indexable content.
 *
 * `/icon` = generated favicon (app/icon.tsx). Unlike static icon files
 * it has no extension, so the matcher does not exclude it.
 * `/manifest.json`: the fetch of a manifest NEVER sends cookies, so
 * without whitelist it went to /login and the browser logged
 * “Manifest: Syntax error” on all pages.
 */
const PUBLIC_ROUTES = new Set([
  "/login",
  // `/signup` is a real page from MIN-300 (the registration wizard): it
  // it needs its line here, otherwise the proxy would send to `/login` the
  // person who specifically comes to create their account.
  "/signup",
  // `/feedback` (app/feedback/route.ts) pre-identifies the logged in user
  // then redirect to the public board; disconnected, it redirects without SSO.
  // So she knows how to handle both cases — protecting her broke her for the second.
  "/feedback",
  // `/desktop/return` (app/desktop/return/route.ts) bounces browser
  // system to `minddy://` after a detour via Stripe. The browser that
  // returns is not necessarily the one where you are connected, and the page does not carry
  // nothing personal — protecting her would break her for everyone.
  "/desktop/return",
  "/favicon.ico",
  "/icon",
  "/manifest.json",
  "/robots.txt",
  "/sitemap.xml",
  // MCP Integration Guide for Code Wizards (MIN-88).
  "/llms.txt",
  "/llms-full.txt",
]);

/**
 * `/.well-known/` = OAuth discovery (RFC 8414/9728) and MCP card, necessarily
 * accessible without session. `/share/` = public view links (MIN-26) — the
 * page validates the token itself. `/f/` = public feedback boards (MIN-37).
 * `/og` = the sharing tile (app/og/route.tsx): without it, Slack, `/p/` = wiki pages published for reading (MIN-283) — the route validates its
 * token itself, just like `/share/`.
 */
const PUBLIC_PREFIXES = ["/auth/", "/_next/", "/.well-known/", "/share/", "/f/", "/p/", "/og", "/md", "/api/runtime-config"];

/** Public but not indexed: the URL IS the secret, or there is nothing to index.
 `/p/` is (MIN-283): publishing a page does not make it findable on
 Google, and it is not an option — neither here nor in the dialog. */
const NOINDEX_PREFIXES = ["/share/", "/f/", "/p/"];

// Custom domains (MIN-36): paths served as is on a host
//custom. `/f/` + `/share/` = cross-navigation by token (site tabs
// public) ; `/icon`, `/favicon.ico`, `/manifest.json` = routes/fichiers de
// metadata that would otherwise be rewritten to /f/<token>/icon → 404.
const CUSTOM_HOST_PASS_PREFIXES = ["/f/", "/share/", "/p/", "/api/", "/auth/", "/_next/", "/.well-known/"];
const CUSTOM_HOST_PASS_ROUTES = new Set(["/favicon.ico", "/icon", "/manifest.json"]);

// Among these passing prefixes, those whose first segment is a TOKEN, therefore
// denotes content owned by a tenant (MIN-337). On the domain of a
// client, only the tokens from HIS project pass: the others are content
// foreigners, served under his name and behind his certificate.
const CUSTOM_HOST_TOKEN_PREFIXES: ReadonlyArray<{ prefix: string; kind: PublicTokenKind }> = [
  { prefix: "/f/", kind: "feedback" },
  { prefix: "/share/", kind: "share" },
  { prefix: "/p/", kind: "page" },
];

// Anonymous public pages (feedback board /f/, shared views /share/, site
// marketing and legal pages): we tag the request so that the root layout
// switch the default theme to "system" instead of "dark" (MIN-60). The header
// being placed on the server side, the anti-FOUC script of the layout chooses the correct default
// from the first paint.
const PUBLIC_SITE_PREFIXES = ["/f/", "/share/", "/p/"];
const PUBLIC_THEME_HEADER = "x-minddy-public";
const LOCALE_HEADER = "x-minddy-locale";
const ROUTE_HEADER = "x-minddy-route";

/** The prefix of all headers that THIS file sets, and that only it sets. */
const TRUST_HEADER_PREFIX = "x-minddy-";

/**
 * Rewrites the REQUEST headers (what the layout and next-intl read).
 *
 * Any INCOMING `x-minddy-*` leaves first (MIN-351). These headers are proxy assertions — “this page is public,” “the language of this URL
 * is French” — and the layout takes them at their word. Nothing prevents a
 * client from sending them itself: `curl -H 'x-minddy-public: 1'` on a page
 * of the app, and the rendering switches to the setting of the public site. We delete before
 * writing, on EVERY path that renders, including those which add nothing —
 * not setting a header is not the same as not having one.
 */
function withRequestHeaders(
  request: NextRequest,
  extra: Record<string, string> = {},
): { request: { headers: Headers } } {
  const headers = new Headers(request.headers);
  // The spread is NOT superfluous: `headers.delete()` mutates the collection we
  // iterate. Without the copy, the iterator skips headers — and which ones it skips
  // are precisely the ones we wanted to remove.
  // oxlint-disable-next-line unicorn/no-useless-spread
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith(TRUST_HEADER_PREFIX)) headers.delete(name);
  }
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return { request: { headers } };
}

/** `NextResponse.next()` with trusted headers cleaned. */
function nextClean(request: NextRequest, extra: Record<string, string> = {}): NextResponse {
  return NextResponse.next(withRequestHeaders(request, extra));
}

function hasPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) =>
      prefix.endsWith("/")
        ? pathname.startsWith(prefix)
        : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Nothing that leaves a client domain goes into a shared cache (MIN-337).
 *
 * These pages are personalized by cookie — the identity of the end user
 * of the board, its shared view unlock — and the `/` of a domain custom
 * fell under the CDN cache header placed on `/` for the landing, without
 * `Vary`: the CDN could serve another visitor's page to one visitor. The cause is
 * handled upstream (`next.config.mjs` headers are now limited to
 * primary hosts); this is the belt, placed on the only path through which
 * passes ANY request from a client domain.
 */
function noSharedCache(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  // The header that the Vercel CDN reads as a priority, and that Next never overwrites
  // (see the long comment of next.config.mjs, which covers the measurement).
  response.headers.set("Vercel-CDN-Cache-Control", "no-store");
  return response;
}

/**
 * Does the requested path point to content from ANOTHER tenant? (MIN-337)
 *
 * `/f/`, `/share/` and `/p/` are passing on a client domain — the board has
 * needs `/f/<son token>/…` for its tabs, and a shared view can be
 * opened from a board. But the token is a global identifier: without this
 * control, `feedback.acme.com/f/<token d'un concurrent>` made the board of the
 * competitor, under the name of Acme.
 *
 * `false` on a path without token (`/_next/`, `/favicon.ico`…): nothing to
 * to attach to a tenant, nothing to refuse.
 */
async function isForeignTenantPath(
  pathname: string,
  target: DomainTarget,
): Promise<boolean> {
  const match = CUSTOM_HOST_TOKEN_PREFIXES.find(({ prefix }) => pathname.startsWith(prefix));
  if (!match) return false;

  const token = pathname.slice(match.prefix.length).split("/")[0] ?? "";
  if (!token) return true;

  const projectId = await lookupTokenProject(match.kind, token);
  // Unknown token: 404 here rather than a rendering which will be 404 later — and no
  // observable difference between “does not exist” and “belongs to another”.
  return projectId !== target.projectId;
}

/**
 * Host custom → rewrite to the mapped public page (feedback board or
 * shared view): `/` becomes `/f/<token>` (resp. `/share/<token>`), the
 * subpaths are prefixed (`/p/123`) → `/f/<token>/p/123`), the query string
 * is preserved. Unknown host, or domain whose ownership is not yet
 * verified → 404 text. Never Supabase auth here: a client domain only serves the public.
 */
async function proxyCustomHost(request: NextRequest, host: string): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  // Crawl a client domain (MIN-88). Without this branch, `/robots.txt` was
  // rewritten as `/f/<token>/robots.txt` — a route that does not exist, therefore a
  // 404 as robots.txt: the crawler deduces “everything is authorized” and
  // indexes the board under the client's domain. Boards remain off-index
  // (framing decision), so we respond explicitly.
  if (pathname === "/robots.txt") {
    return noSharedCache(
      new NextResponse("User-agent: *\nDisallow: /\n", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
    );
  }
  // A client domain does not have a sitemap: 404 franc rather than rewriting
  // to a non-existent route, which produced the same code but in HTML.
  if (pathname === "/sitemap.xml") {
    return noSharedCache(new NextResponse("Not found", { status: 404 }));
  }

  // The mapping is resolved BEFORE the passing paths: it is he who names the
  // tenant of the domain, and therefore what token prefixes have the right to
  // serve. A host without verified mapping is no longer useful at all, assets
  // understood — there is no page they belong on.
  const target = await lookupCustomDomain(host);
  if (!target) return noSharedCache(new NextResponse("Unknown domain", { status: 404 }));

  if (
    CUSTOM_HOST_PASS_ROUTES.has(pathname) ||
    CUSTOM_HOST_PASS_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    if (await isForeignTenantPath(pathname, target)) {
      return noSharedCache(new NextResponse("Not found", { status: 404 }));
    }
    // A custom host only serves the public → “system” theme (MIN-60). Harmless
    // on /api, /_next… which do not render the themed layout.
    return noSharedCache(
      NextResponse.next(withRequestHeaders(request, { [PUBLIC_THEME_HEADER]: "1" })),
    );
  }

  const base = target.kind === "feedback" ? `/f/${target.token}` : `/share/${target.token}`;
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? base : `${base}${pathname}`;
  const response = noSharedCache(
    NextResponse.rewrite(url, withRequestHeaders(request, { [PUBLIC_THEME_HEADER]: "1" })),
  );
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}

function isSupabaseGetSessionWarning(args: unknown[]): boolean {
  return args.some(
    (arg) => typeof arg === "string" && arg.includes("supabase.auth.getSession()")
  );
}

/**
 * Current session read from cookies. `getSession()` does not check the
 * signature of the JWT: it is only used here for the routing and renewal of
 * cookies, never to authorize any data. Handlers verify the identity
 * with `getClaims()` or their dedicated guard.
 *
 * ## She WRITES, and that's the whole point of `sink` (MIN-293)
 *
 * Read a session can renew it: expired access token, GoTrue returns a new pair and **spins** the refresh token as it passes.
 * The adapter here had an empty `setAll` — it SPENT the token and threw away the new pair. The browser kept the old one, and the next refresh
 * failed in `refresh_token_not_found`: silent disconnect, fixed
 * on the roads side and remained alive here.
 *
 * Both callers are PUBLIC pages (`/`, `/login`, `/signup`): the
 * "app routes" branch, further down, has its own client which already writes.
 * Hence the obligation, for them, to pass **each** output through `applyCookies` —
 * the redirection to /home included.
 */
async function readSession(request: NextRequest, url: string, key: string) {
  const sink = createCookieSink();
  const supabase = createServerClient(url, key, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll: sink.collect,
    },
  });
  const _w = console.warn;
  console.warn = (...a: unknown[]) => {
    if (isSupabaseGetSessionWarning(a)) return;
    _w.apply(console, a);
  };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  console.warn = _w;
  return { session, applyCookies: sink.applyCookies };
}

/**
 * Authenticated session but whose second factor has not yet been presented
 * (MIN-132): it has the right to go to the challenge screen, and nowhere
 * elsewhere.
 *
 * The proxy does not VERIFY the signature here — it only does router, as for
 * the presence of session just above. The real guard is `getAuthedUser` :
 * a `aal1` session that forces passage would only get, on each
 * API call, a 403 `mfa_required`. The rendered app would be an empty shell.
 */
function awaitsMfaChallenge(session: { access_token?: string } | null): boolean {
  if (!session?.access_token) return false;
  return needsMfaChallenge(decodeJwtPayload(session.access_token));
}

/**
 * Public site: language carried by the URL (MIN-88). `/fr/tarifs` is rewritten
 * to `/pricing` by making `x-minddy-locale: fr` — a single code page,
 * two indexable URLs. Without a header, the same URL served both languages
 * according to a cookie: Googlebot only saw English, and half of the content
 * on the site didn't exist for anyone.
 */
function serveLocalizedPublicRoute(request: NextRequest, pathname: string): NextResponse {
  const englishPath = englishPathForFrench(pathname);
  const locale = englishPath ? "fr" : "en";
  const route = routeByPath(pathname);
  const headers: Record<string, string> = {
    [PUBLIC_THEME_HEADER]: "1",
    [LOCALE_HEADER]: locale,
    ...(route ? { [ROUTE_HEADER]: route.key } : {}),
  };

  const markdownPath = route ? `/md?route=${route.key}&locale=${locale}` : null;

  // Content negotiation (MIN-88). An agent who explicitly requests
  // Markdown receives the content of the page without the 440 KB of markup it
  // has nothing to do. `app/md/route.ts` returns it from the same i18n keys.
  if (markdownPath && prefersMarkdown(request.headers.get("accept"))) {
    // The requested page travels in `ROUTE_HEADER`, not in this query
    // rewrite: on a middleware rewrite, Next 16 gives the route
    // handle the ORIGINAL URL, so `/md` never saw `?route=…` and
    // fell back on its default — all the pages of the site used Markdown
    // from the landing (MIN-93). The query remains in the rewritten URL so that
    // logs say what was served.
    return NextResponse.rewrite(
      new URL(markdownPath, request.url),
      withRequestHeaders(request, headers),
    );
  }

  const response = englishPath
    ? NextResponse.rewrite(
        rewriteTo(request, englishPath),
        withRequestHeaders(request, headers),
      )
    : NextResponse.next(withRequestHeaders(request, headers));

  // …and the HTML page itself announces its Markdown version, for those who do not think
  // not to ask for it.
  if (markdownPath) {
    response.headers.append(
      "Link",
      `<${markdownPath}>; rel="alternate"; type="text/markdown"`,
    );
  }
  return response;
}

function rewriteTo(request: NextRequest, pathname: string): URL {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return url;
}

/**
 * `text/markdown` must be requested EXPLICITLY: a browser sends
 * `Accept: text/html,…,*​/*`, and the wildcard must never be enough to switch a
 * public page in plain text.
 */
function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  return accept
    .split(",")
    .some((part) => part.trim().toLowerCase().startsWith("text/markdown"));
}

export async function proxy(request: NextRequest) {
  // Custom domain (MIN-36): dedicated branch, BEFORE all logic
  // pathname-based — primary hosts pay nothing, custom hosts do not
  // touchent jamais l'auth/locale/login.
  const host = normalizeHost(request.headers.get("host") ?? "");
  if (host && !isPrimaryHost(host)) {
    return proxyCustomHost(request, host);
  }

  const pathname = request.nextUrl.pathname;
  const supabaseUrl = process.env.MINDDY_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.MINDDY_PUBLIC_SUPABASE_ANON_KEY;

  // Supabase not configured (empty .env) → don't block navigation.
  if (!supabaseUrl || !supabaseKey) {
    return nextClean(request);
  }

  // What session reading possibly has to write (MIN-293). Identify
  // as long as no session has been read — then there is nothing to carry forward.
  let applySession = <T extends NextResponse>(response: T): T => response;

  // --- Localized public site (the six pages of lib/public-routes.ts) ---------
  if (PUBLIC_ROUTE_PATHS.has(pathname)) {
    const route = routeByPath(pathname);

    if (route?.key === "home") {
      // An already logged in visitor who types minddy.app wants their app, not
      // the argument. The bounce lived in the page, where it cost a
      // `auth.getUser()` — a network round trip to GoTrue BEFORE the first
      // byte of the landing, which also made it non-cacheable. Here he
      // costs only one signature verification (MIN-88).
      const { session, applyCookies } = await readSession(
        request,
        supabaseUrl,
        supabaseKey,
      );
      applySession = applyCookies;
      if (session?.user) {
        return applySession(NextResponse.redirect(new URL("/home", request.url)));
      }

      // French-speaking visitor on `/` → `/fr`. Cookie first (a preference
      // explicit), the `Accept-Language` then. Before localized URLs, the
      // cookie made `/` render in French; now that the language is
      // carried by the URL, the only way to continue honoring it is to send
      // the visitor to the correct URL.
      //
      // TEMPORAIRE (307), jamais permanent : `/` doit rester crawlable telle
      // what, and Googlebot has neither cookies nor French `Accept-Language` — it
      // therefore always receives 200 on the English version.
      if (pathname === "/") {
        const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
        const preferred =
          cookieLocale ??
          detectFromAcceptLanguage(request.headers.get("accept-language"));
        if (preferred === "fr") {
          // `nextUrl.clone()`, and above all NOT `new URL("/fr", request.url)`:
          // a relative URL starts from the root and deletes the query. A
          // French speaking arriving on `/?utm_source=…` was sent to a
          // `/fr` nu — the attribution of the visit left with, and the landing
          // registered as `$direct`. This is exactly the traffic (campaign,
          // launch, newsletter) that we seek to measure.
          const target = request.nextUrl.clone();
          target.pathname = "/fr";
          return applySession(NextResponse.redirect(target, 307));
        }
      }
    }

    return applySession(serveLocalizedPublicRoute(request, pathname));
  }

  // --- Other public routes (login, metadata assets, boards, etc.) ------
  if (PUBLIC_ROUTES.has(pathname) || hasPrefix(pathname, PUBLIC_PREFIXES)) {
    // On /login and /signup, bounce already-authenticated users to /home — except
    // if their session is still waiting for its second factor (MIN-132): /login EST
    // the challenge screen, and send them back to /home loops indefinitely.
    // `/signup` follows the same rule: a connected account does not have an account
    // create, and the wizard would exit by itself one frame later.
    if (pathname === "/login" || pathname === "/signup") {
      const { session, applyCookies } = await readSession(
        request,
        supabaseUrl,
        supabaseKey,
      );
      applySession = applyCookies;
      if (session?.user && !awaitsMfaChallenge(session)) {
        return applySession(NextResponse.redirect(new URL("/home", request.url)));
      }
    }

    const isPublicSite = hasPrefix(pathname, PUBLIC_SITE_PREFIXES);
    const response = isPublicSite
      ? nextClean(request, { [PUBLIC_THEME_HEADER]: "1" })
      : nextClean(request);

    // Feedback boards and shared views: outside the index whatever happens. THE
    // `metadata.robots` of pages only covers HTML — not responses
    // JSON, images, nor subroutes.
    if (hasPrefix(pathname, NOINDEX_PREFIXES)) {
      response.headers.set("X-Robots-Tag", "noindex");
    }
    return applySession(response);
  }

  // --- Everything that is not protected is rendered (and therefore in 404) ---------
  if (!isProtectedPath(pathname)) {
    return nextClean(request);
  }

  // --- Routes de l'app : session obligatoire -------------------------------
  let response = nextClean(request);

  // Cookies written while reading the session (MIN-293): the response is
  // rebuilt below when the account theme is asserted, and a rebuild must
  // carry them — or the rotation is spent and the next refresh dies.
  let refreshedCookies: {
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }[] = [];

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        refreshedCookies = cookiesToSet;
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = nextClean(request);
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS })
        );
      },
    },
  });

  // `getSession()` reads cookies but does not verify the JWT signature. There
  // route only uses it to route and refresh the session; APIs keep
  // their own verification. The SDK rightly warns, but the warning is
  // hidden here so as not to pollute the logs with each request.
  const _w = console.warn;
  console.warn = (...a: unknown[]) => {
    if (isSupabaseGetSessionWarning(a)) return;
    _w.apply(console, a);
  };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  console.warn = _w;

  // No session, or session whose second factor has not yet been
  // presented (MIN-132): in both cases the destination is /login, which renders
  // the form or the challenge screen depending on what it finds.
  if (!session?.user || awaitsMfaChallenge(session)) {
    const loginUrl = new URL("/login", request.url);
    // pathname + search: /oauth/authorize must find its parameters
    // (client_id, code_challenge…) after passing through /login.
    loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    const redirect = NextResponse.redirect(loginUrl);
    // Even on redirection: an app URL does not have to appear in an index,
    // if only as “page with redirection”.
    redirect.headers.set("X-Robots-Tag", "noindex, nofollow");
    return redirect;
  }

  // Cross-device theme (account settings): the chosen appearance travels
  // in `user_metadata`, so the root layout can start from the ACCOUNT value
  // instead of the app default — the pre-paint script applies it before the
  // first paint, with no flash, even on a device that has never been seen.
  // Re-asserted on EVERY request (unlike the NEXT_LOCALE seed below, which is
  // written once): a stale theme is visible immediately, in every pixel.
  // Placed BEFORE the noindex header below: the rebuild replaces the
  // response, and anything set earlier on it would be lost.
  const accountTheme = resolveAccountTheme(
    session.user.user_metadata as Record<string, unknown> | undefined,
  );
  if (accountTheme) {
    response = nextClean(request, { [ACCOUNT_THEME_HEADER]: accountTheme });
    for (const { name, value, options } of refreshedCookies) {
      response.cookies.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS });
    }
  }

  // The authenticated app has nothing to do in an index, whatever
  // the environment. `app/(app)/layout.tsx` already places `robots: noindex` on the
  //HTML; this header covers everything else (MIN-88).
  response.headers.set("X-Robots-Tag", "noindex, nofollow");

  // Cross-device locale: if no NEXT_LOCALE cookie yet, seed it from the user's
  // saved preference so the UI language follows the account, not the browser.
  if (!request.cookies.get("NEXT_LOCALE")?.value) {
    const metaLocale = session.user.user_metadata?.locale;
    if (typeof metaLocale === "string") {
      response.cookies.set("NEXT_LOCALE", metaLocale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js|css|woff2?)$).*)",
  ],
};
