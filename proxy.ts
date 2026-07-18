import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { lookupCustomDomain } from "@/lib/custom-domain-lookup";
import { isPrimaryHost, normalizeHost } from "@/lib/public-hosts";

/**
 * Next 16 middleware (named `proxy`). Protects every route except the public
 * ones below, refreshing the Supabase session on the way through.
 *
 * - No session on a protected route → redirect to /login?redirect=<path>
 * - Authenticated user hitting /login → redirect to /home
 *
 * API routes are intentionally excluded (they authenticate themselves), matching
 * the AutoKap pattern this is cloned from.
 */

// `/icon` = generated favicon route (app/icon.tsx). Unlike the static icon
// files (icon1.png, apple-icon.png, favicon.ico) it has no extension, so the
// matcher regex below doesn't exclude it — it must be whitelisted here or the
// favicon would redirect to /login for logged-out visitors (login/signup pages).
// `/manifest.json` : le fetch d'un manifest n'envoie JAMAIS les cookies (sauf
// crossorigin=use-credentials), donc sans whitelist il redirige vers /login et
// le navigateur logge « Manifest: Syntax error » sur toutes les pages.
const PUBLIC_ROUTES = new Set([
  "/login",
  "/signup",
  "/favicon.ico",
  "/icon",
  "/manifest.json",
]);
// `/api/` is excluded from middleware auth on purpose: route handlers
// authenticate themselves (getAuthedUser) and must return JSON 401 — never an
// HTML redirect to /login. `/.well-known/` = découverte OAuth (RFC 8414/9728),
// forcément accessible sans session. `/share/` = liens publics de vues
// (MIN-26) — la page valide elle-même le token (et le mot de passe).
// `/f/` = boards publics de feedback (MIN-37) — token + session OTP/SSO propre.
const PUBLIC_PREFIXES = ["/api/", "/auth/", "/_next/", "/.well-known/", "/share/", "/f/"];

// Domaines personnalisés (MIN-36) : chemins servis tels quels sur un host
// custom. `/f/` + `/share/` = navigation croisée par token (onglets du site
// public) ; `/icon`, `/favicon.ico`, `/manifest.json` = routes/fichiers de
// métadonnées qui seraient sinon réécrits vers /f/<token>/icon → 404.
const CUSTOM_HOST_PASS_PREFIXES = ["/f/", "/share/", "/api/", "/auth/", "/_next/", "/.well-known/"];
const CUSTOM_HOST_PASS_ROUTES = new Set(["/favicon.ico", "/icon", "/manifest.json"]);

// Pages publiques anonymes (board de feedback /f/, vues partagées /share/) : on
// tague la requête pour que le root layout bascule le thème par défaut sur
// "system" au lieu de "dark" (MIN-60). Le header étant posé côté serveur, le
// script anti-FOUC du layout choisit le bon défaut dès le premier paint.
const PUBLIC_SITE_PREFIXES = ["/f/", "/share/"];
const PUBLIC_THEME_HEADER = "x-minddy-public";

function withPublicThemeHeader(request: NextRequest): { request: { headers: Headers } } {
  const headers = new Headers(request.headers);
  headers.set(PUBLIC_THEME_HEADER, "1");
  return { request: { headers } };
}

/**
 * Host custom → réécriture vers la page publique mappée (board de feedback ou
 * vue partagée) : `/` devient `/f/<token>` (resp. `/share/<token>`), les
 * sous-chemins sont préfixés (`/p/123` → `/f/<token>/p/123`), la query string
 * est préservée. Host inconnu (domaine encore attaché à Vercel mais mapping
 * supprimé) → 404 texte. Jamais d'auth Supabase ici : un domaine client ne
 * sert que du public.
 */
async function proxyCustomHost(request: NextRequest, host: string): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  if (
    CUSTOM_HOST_PASS_ROUTES.has(pathname) ||
    CUSTOM_HOST_PASS_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    // Un host custom ne sert que du public → thème "system" (MIN-60). Inoffensif
    // sur /api, /_next… qui ne rendent pas le layout thémé.
    return NextResponse.next(withPublicThemeHeader(request));
  }

  const target = await lookupCustomDomain(host);
  if (!target) return new NextResponse("Unknown domain", { status: 404 });

  const base = target.kind === "feedback" ? `/f/${target.token}` : `/share/${target.token}`;
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? base : `${base}${pathname}`;
  return NextResponse.rewrite(url, withPublicThemeHeader(request));
}

function isSupabaseGetSessionWarning(args: unknown[]): boolean {
  return args.some(
    (arg) => typeof arg === "string" && arg.includes("supabase.auth.getSession()")
  );
}

export async function proxy(request: NextRequest) {
  // Domaine personnalisé (MIN-36) : branche dédiée, AVANT toute la logique
  // pathname-based — les hosts primaires ne paient rien, les hosts custom ne
  // touchent jamais l'auth/locale/login.
  const host = normalizeHost(request.headers.get("host") ?? "");
  if (host && !isPrimaryHost(host)) {
    return proxyCustomHost(request, host);
  }

  const pathname = request.nextUrl.pathname;

  const isPublicRoute =
    PUBLIC_ROUTES.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Supabase not configured (empty .env) → don't block navigation.
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  if (isPublicRoute) {
    // On /login, bounce already-authenticated users to /home.
    if (pathname === "/login") {
      const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {},
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
      if (session?.user) {
        return NextResponse.redirect(new URL("/home", request.url));
      }
    }
    // Board de feedback / vues partagées : thème par défaut "system" (MIN-60).
    if (PUBLIC_SITE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      return NextResponse.next(withPublicThemeHeader(request));
    }
    return NextResponse.next({ request });
  }

  // Protected route: refresh session (writable cookie adapter) and gate access.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getSession() validates the JWT locally (no network round-trip). The SDK's
  // "use getUser()" warning is spurious here — suppress it just for this call.
  const _w = console.warn;
  console.warn = (...a: unknown[]) => {
    if (isSupabaseGetSessionWarning(a)) return;
    _w.apply(console, a);
  };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  console.warn = _w;

  if (!session?.user) {
    const loginUrl = new URL("/login", request.url);
    // pathname + search : /oauth/authorize doit retrouver ses paramètres
    // (client_id, code_challenge…) après le passage par /login.
    const target = pathname + request.nextUrl.search;
    // '/' n'est qu'un redirecteur serveur vers /home : ne jamais le passer en
    // `redirect`. Sinon la connexion renvoie l'utilisateur sur '/', dont la
    // redirection déconnectée a été préchargée dans le cache du routeur par le
    // logo <Link href="/"> de la page login — et il reste piégé sur /login.
    if (target !== "/") {
      loginUrl.searchParams.set("redirect", target);
    }
    return NextResponse.redirect(loginUrl);
  }

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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js|css|woff2?)$).*)",
  ],
};
