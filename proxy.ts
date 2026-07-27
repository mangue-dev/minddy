import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { lookupCustomDomain } from "@/lib/custom-domain-lookup";
import { isPrimaryHost, normalizeHost } from "@/lib/public-hosts";
import { detectFromAcceptLanguage } from "@/lib/accept-language";
import {
  PUBLIC_ROUTE_PATHS,
  englishPathForFrench,
  routeByPath,
} from "@/lib/public-routes";
import { isProtectedPath } from "@/lib/protected-prefixes";

/**
 * Next 16 middleware (named `proxy`). Il fait quatre choses : router les
 * domaines personnalisés, résoudre la langue des URLs publiques, garder les
 * routes de l'app derrière une session, et tenir les crawlers hors de ce qui
 * ne les regarde pas.
 *
 * Ce qui exige une session vit dans `lib/protected-prefixes.ts` (liste NOIRE) :
 * tout ce qui n'y est pas tombe dans le rendu Next, et donc en 404 s'il n'y a
 * pas de route. Voir ce fichier pour le pourquoi de l'inversion.
 *
 * API mises à part : `/api/` s'authentifie tout seul (401 JSON, jamais une
 * redirection HTML vers /login), donc le matcher l'exclut.
 */

/**
 * Routes publiques hors du site marketing : elles n'ont pas de version
 * localisée et ne portent pas de contenu indexable.
 *
 * `/icon` = favicon généré (app/icon.tsx). Contrairement aux fichiers d'icônes
 * statiques il n'a pas d'extension, donc le matcher ne l'exclut pas.
 * `/manifest.json` : le fetch d'un manifest n'envoie JAMAIS les cookies, donc
 * sans whitelist il partait vers /login et le navigateur loggait
 * « Manifest: Syntax error » sur toutes les pages.
 */
const PUBLIC_ROUTES = new Set([
  "/login",
  // `/signup` part en 308 vers `/login?mode=signup` depuis next.config, donc
  // avant d'arriver ici. On le garde par sécurité : si la redirection saute, la
  // route doit tomber en 404, pas repartir vers /login avec un `?redirect=`.
  "/signup",
  // `/feedback` (app/feedback/route.ts) pré-identifie l'utilisateur connecté
  // puis redirige vers le board public ; déconnecté, elle redirige sans SSO.
  // Elle sait donc gérer les deux cas — la protéger la cassait pour le second.
  "/feedback",
  "/favicon.ico",
  "/icon",
  "/manifest.json",
  "/robots.txt",
  "/sitemap.xml",
  // Guide d'intégration MCP pour les assistants de code (MIN-88).
  "/llms.txt",
  "/llms-full.txt",
]);

/**
 * `/.well-known/` = découverte OAuth (RFC 8414/9728) et carte MCP, forcément
 * accessibles sans session. `/share/` = liens publics de vues (MIN-26) — la
 * page valide elle-même le token. `/f/` = boards publics de feedback (MIN-37).
 * `/og` = la vignette de partage (app/og/route.tsx) : sans elle, Slack, X et
 * les moteurs recevraient une redirection vers /login au lieu de l'image.
 */
const PUBLIC_PREFIXES = ["/auth/", "/_next/", "/.well-known/", "/share/", "/f/", "/og", "/md"];

/** Publiques mais hors index : l'URL EST le secret, ou il n'y a rien à indexer. */
const NOINDEX_PREFIXES = ["/share/", "/f/"];

// Domaines personnalisés (MIN-36) : chemins servis tels quels sur un host
// custom. `/f/` + `/share/` = navigation croisée par token (onglets du site
// public) ; `/icon`, `/favicon.ico`, `/manifest.json` = routes/fichiers de
// métadonnées qui seraient sinon réécrits vers /f/<token>/icon → 404.
const CUSTOM_HOST_PASS_PREFIXES = ["/f/", "/share/", "/api/", "/auth/", "/_next/", "/.well-known/"];
const CUSTOM_HOST_PASS_ROUTES = new Set(["/favicon.ico", "/icon", "/manifest.json"]);

// Pages publiques anonymes (board de feedback /f/, vues partagées /share/, site
// marketing et pages légales) : on tague la requête pour que le root layout
// bascule le thème par défaut sur "system" au lieu de "dark" (MIN-60). Le header
// étant posé côté serveur, le script anti-FOUC du layout choisit le bon défaut
// dès le premier paint.
const PUBLIC_SITE_PREFIXES = ["/f/", "/share/"];
const PUBLIC_THEME_HEADER = "x-minddy-public";
const LOCALE_HEADER = "x-minddy-locale";
const ROUTE_HEADER = "x-minddy-route";

/**
 * Les six pages du site marketing, et elles seules (MIN-100). Le root layout
 * s'en sert pour ne PAS sérialiser les 67 namespaces du catalogue i18n dans le
 * document — 39 Ko gzippés en travers de la file de téléchargement de l'image
 * du LCP. Voir `lib/public-client-messages.ts`.
 *
 * Distinct de `PUBLIC_THEME_HEADER`, qui couvre aussi les boards de feedback et
 * les vues partagées : ces pages-là sont de vraies applications clientes et ont
 * besoin de leurs propres namespaces.
 */
const MARKETING_HEADER = "x-minddy-marketing";

/** Réécrit les en-têtes de la REQUÊTE (ce que lisent le layout et next-intl). */
function withRequestHeaders(
  request: NextRequest,
  extra: Record<string, string>,
): { request: { headers: Headers } } {
  const headers = new Headers(request.headers);
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return { request: { headers } };
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
 * Host custom → réécriture vers la page publique mappée (board de feedback ou
 * vue partagée) : `/` devient `/f/<token>` (resp. `/share/<token>`), les
 * sous-chemins sont préfixés (`/p/123` → `/f/<token>/p/123`), la query string
 * est préservée. Host inconnu (domaine encore attaché à Vercel mais mapping
 * supprimé) → 404 texte. Jamais d'auth Supabase ici : un domaine client ne
 * sert que du public.
 */
async function proxyCustomHost(request: NextRequest, host: string): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  // Crawl d'un domaine client (MIN-88). Sans cette branche, `/robots.txt` était
  // réécrit en `/f/<token>/robots.txt` — une route qui n'existe pas, donc un
  // 404 en guise de robots.txt : le crawler en déduit « tout est autorisé » et
  // indexe le board sous le domaine du client. Les boards restent hors index
  // (décision de cadrage), donc on répond explicitement.
  if (pathname === "/robots.txt") {
    return new NextResponse("User-agent: *\nDisallow: /\n", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  // Un domaine client n'a pas de sitemap : 404 franc plutôt que la réécriture
  // vers une route inexistante, qui produisait le même code mais en HTML.
  if (pathname === "/sitemap.xml") {
    return new NextResponse("Not found", { status: 404 });
  }

  if (
    CUSTOM_HOST_PASS_ROUTES.has(pathname) ||
    CUSTOM_HOST_PASS_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    // Un host custom ne sert que du public → thème "system" (MIN-60). Inoffensif
    // sur /api, /_next… qui ne rendent pas le layout thémé.
    return NextResponse.next(withRequestHeaders(request, { [PUBLIC_THEME_HEADER]: "1" }));
  }

  const target = await lookupCustomDomain(host);
  if (!target) return new NextResponse("Unknown domain", { status: 404 });

  const base = target.kind === "feedback" ? `/f/${target.token}` : `/share/${target.token}`;
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? base : `${base}${pathname}`;
  const response = NextResponse.rewrite(
    url,
    withRequestHeaders(request, { [PUBLIC_THEME_HEADER]: "1" }),
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
 * Session courante, vérifiée LOCALEMENT (signature du JWT, aucun aller-retour
 * réseau vers GoTrue). L'avertissement « use getUser() » du SDK ne s'applique
 * pas ici : le middleware ne fait que router, il n'autorise aucune donnée.
 */
async function readSession(request: NextRequest, url: string, key: string) {
  const supabase = createServerClient(url, key, {
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
  return session;
}

/**
 * Site public : langue portée par l'URL (MIN-88). `/fr/tarifs` est réécrite
 * vers `/pricing` en posant `x-minddy-locale: fr` — une seule page de code,
 * deux URLs indexables. Sans en-tête, la même URL servait les deux langues
 * selon un cookie : Googlebot ne voyait que l'anglais, et la moitié du contenu
 * du site n'existait pour personne.
 */
function serveLocalizedPublicRoute(request: NextRequest, pathname: string): NextResponse {
  const englishPath = englishPathForFrench(pathname);
  const locale = englishPath ? "fr" : "en";
  const route = routeByPath(pathname);
  const headers: Record<string, string> = {
    [PUBLIC_THEME_HEADER]: "1",
    [MARKETING_HEADER]: "1",
    [LOCALE_HEADER]: locale,
    ...(route ? { [ROUTE_HEADER]: route.key } : {}),
  };

  const markdownPath = route ? `/md?route=${route.key}&locale=${locale}` : null;

  // Négociation de contenu (MIN-88). Un agent qui demande explicitement du
  // Markdown reçoit le contenu de la page sans les 440 Ko de balisage dont il
  // n'a que faire. `app/md/route.ts` le rend depuis les mêmes clés i18n.
  if (markdownPath && prefersMarkdown(request.headers.get("accept"))) {
    // La page demandée voyage dans `ROUTE_HEADER`, pas dans la query de cette
    // réécriture : sur une réécriture de middleware, Next 16 donne au route
    // handler l'URL D'ORIGINE, donc `/md` ne voyait jamais `?route=…` et
    // retombait sur son défaut — toutes les pages du site servaient le Markdown
    // de la landing (MIN-93). La query reste dans l'URL réécrite pour que les
    // journaux disent ce qui a été servi.
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

  // …et la page HTML annonce elle-même sa version Markdown, pour qui ne pense
  // pas à la demander.
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
 * `text/markdown` doit être demandé EXPLICITEMENT : un navigateur envoie
 * `Accept: text/html,…,*​/*`, et le joker ne doit jamais suffire à basculer une
 * page publique en texte brut.
 */
function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  return accept
    .split(",")
    .some((part) => part.trim().toLowerCase().startsWith("text/markdown"));
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Supabase not configured (empty .env) → don't block navigation.
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  // --- Site public localisé (les six pages de lib/public-routes.ts) ---------
  if (PUBLIC_ROUTE_PATHS.has(pathname)) {
    const route = routeByPath(pathname);

    if (route?.key === "home") {
      // Un visiteur déjà connecté qui tape minddy.app veut son app, pas
      // l'argumentaire. Le rebond vivait dans la page, où il coûtait un
      // `auth.getUser()` — un aller-retour réseau vers GoTrue AVANT le premier
      // octet de la landing, ce qui la rendait aussi non cacheable. Ici il ne
      // coûte qu'une vérification de signature (MIN-88).
      const session = await readSession(request, supabaseUrl, supabaseKey);
      if (session?.user) {
        return NextResponse.redirect(new URL("/home", request.url));
      }

      // Visiteur francophone sur `/` → `/fr`. Le cookie d'abord (une préférence
      // explicite), l'`Accept-Language` ensuite. Avant les URLs localisées, le
      // cookie faisait rendre `/` en français ; maintenant que la langue est
      // portée par l'URL, la seule façon de continuer à l'honorer est d'envoyer
      // le visiteur sur la bonne URL.
      //
      // TEMPORAIRE (307), jamais permanent : `/` doit rester crawlable telle
      // quelle, et Googlebot n'a ni cookie ni `Accept-Language` français — il
      // reçoit donc toujours 200 sur la version anglaise.
      if (pathname === "/") {
        const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
        const preferred =
          cookieLocale ??
          detectFromAcceptLanguage(request.headers.get("accept-language"));
        if (preferred === "fr") {
          // `nextUrl.clone()`, et surtout PAS `new URL("/fr", request.url)` :
          // une URL relative repart de la racine et efface la query. Un
          // francophone arrivant sur `/?utm_source=…` était renvoyé vers un
          // `/fr` nu — l'attribution de la visite partait avec, et la landing
          // s'enregistrait en `$direct`. C'est exactement le trafic (campagne,
          // lancement, newsletter) qu'on cherche à mesurer.
          const target = request.nextUrl.clone();
          target.pathname = "/fr";
          return NextResponse.redirect(target, 307);
        }
      }
    }

    return serveLocalizedPublicRoute(request, pathname);
  }

  // --- Autres routes publiques (login, assets de métadonnées, boards…) ------
  if (PUBLIC_ROUTES.has(pathname) || hasPrefix(pathname, PUBLIC_PREFIXES)) {
    // On /login, bounce already-authenticated users to /home.
    if (pathname === "/login") {
      const session = await readSession(request, supabaseUrl, supabaseKey);
      if (session?.user) {
        return NextResponse.redirect(new URL("/home", request.url));
      }
    }

    const isPublicSite = hasPrefix(pathname, PUBLIC_SITE_PREFIXES);
    const response = isPublicSite
      ? NextResponse.next(withRequestHeaders(request, { [PUBLIC_THEME_HEADER]: "1" }))
      : NextResponse.next({ request });

    // Boards de feedback et vues partagées : hors index quoi qu'il arrive. Le
    // `metadata.robots` des pages ne couvre que le HTML — pas les réponses
    // JSON, les images, ni les sous-routes.
    if (hasPrefix(pathname, NOINDEX_PREFIXES)) {
      response.headers.set("X-Robots-Tag", "noindex");
    }
    return response;
  }

  // --- Tout ce qui n'est pas protégé part au rendu (et donc en 404) ---------
  if (!isProtectedPath(pathname)) {
    return NextResponse.next({ request });
  }

  // --- Routes de l'app : session obligatoire -------------------------------
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
    loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    const redirect = NextResponse.redirect(loginUrl);
    // Même sur la redirection : une URL d'app n'a pas à figurer dans un index,
    // ne serait-ce que comme « page avec redirection ».
    redirect.headers.set("X-Robots-Tag", "noindex, nofollow");
    return redirect;
  }

  // L'app authentifiée n'a rien à faire dans un index, quel que soit
  // l'environnement. `app/(app)/layout.tsx` pose déjà `robots: noindex` sur le
  // HTML ; cet en-tête couvre tout le reste (MIN-88).
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
