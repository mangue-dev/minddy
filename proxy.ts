import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

const PUBLIC_ROUTES = new Set(["/login", "/signup", "/favicon.ico"]);
// `/api/` is excluded from middleware auth on purpose: route handlers
// authenticate themselves (getAuthedUser) and must return JSON 401 — never an
// HTML redirect to /login. `/.well-known/` = découverte OAuth (RFC 8414/9728),
// forcément accessible sans session.
const PUBLIC_PREFIXES = ["/api/", "/auth/", "/_next/", "/.well-known/"];

function isSupabaseGetSessionWarning(args: unknown[]): boolean {
  return args.some(
    (arg) => typeof arg === "string" && arg.includes("supabase.auth.getSession()")
  );
}

export async function proxy(request: NextRequest) {
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
    loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
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
