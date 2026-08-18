import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { MFA_REQUIRED_CODE, needsMfaChallenge } from "@/lib/mfa";
import { hasForeignOrigin, isMutatingMethod } from "@/lib/server/same-origin";
import {
  createCookieSink,
  SESSION_COOKIE_OPTIONS,
  type CookieSink,
} from "@/lib/session-cookies";

export { createCookieSink, type CookieSink };

/**
 * Anon Supabase client bound to the request cookies (RLS-enforced). Route
 * handlers act *as the user*, so RLS does the tenant isolation — no service
 * client needed for project CRUD. `setAll` is a no-op: handlers don't refresh
 * cookies (the middleware / auth callback own that).
 */
export function createSupabaseFromRequest(request: NextRequest): SupabaseClient {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: SESSION_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {},
      },
    }
  );
}

/**
 * The same client, but which KNOWS WRITE refreshed cookies (MIN-293).
 *
 * ## Why it exists, and why it does not replace the previous one
 *
 * Reading a session can RENEW it. When the access token has expired,
 * `getClaims()` / `getSession()` exchange the refresh token for
 * a new pair — and GoTrue **spins** the refresh token to
 * passage: the old one is no longer worth anything for a few seconds more late.
 *
 * An adapter that throws away what it is given to write therefore transforms a
 * read into session DESTRUCTION: the server has spent the token, the
 * browser keeps the old one, and the next refresh — its own like the
 * ours — fails in `refresh_token_not_found`. In the logs:
 *
 * Error [AuthApiError]: Invalid Refresh Token: Refresh Token Not Found
 *
 * For the app routes, this does not happen: the proxy goes FIRST, and writes to it
 * cookies (proxy.ts, “app routes” branch). The token is therefore already
 * fresh when a handler reads it, and its empty `setAll` costs nothing. This is what
 * says, and it remains true.
 *
 * **The hole is the PUBLIC route that still reads a session.** The proxy la
 * lets it pass without touching auth — that's the whole point of being public —
 * so the handler is the first and only one to open the cookies, with a token
 * which may very well be expired. `/feedback` is this case: it pre-identifies
 * the connected user, and it did it at the cost of his session.
 *
 * Hence this constructor, to be reserved exactly for that: **a public surface
 * which reads the connected user**. It must pass its response through
 * `applyCookies` before returning it, otherwise we are back to the starting point.
 *
 * The carry itself lives in [lib/session-cookies.ts](../session-cookies.ts):
 * the proxy needs it ALSO (MIN-351) and cannot import this module,
 * which is `server-only` and pulls next-intl behind it.
 */
export function createSupabaseWithCookieSink(
  request: NextRequest
): CookieSink & { supabase: SupabaseClient } {
  const sink = createCookieSink();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: SESSION_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll: sink.collect,
      },
    }
  );
  return { ...sink, supabase };
}

export type AuthedResult =
  | {
      ok: true;
      user: User;
      supabase: SupabaseClient;
      /**
 * Verified JWT claims, as is. `user` is a partial reconstruction
 *: what does not belong to the account but to the SESSION — `aal`,
 * `amr`, `session_id` — is not there, and this is precisely what reads
 * a authentication freshness keeper (MIN-345).
 */
      claims: Record<string, unknown>;
    }
  | { ok: false; response: NextResponse };

/**
 * Resolves the authenticated user of a route handler, or error response.
 *
 * We check the JWT via `getClaims()` rather than `getUser()`. With
 * ASYMMETRICAL signing keys (Supabase dashboard → Auth → JWT Signing Keys), the
 * verification is LOCAL (WebCrypto + JWKS cached) — no round trip
 * network to GoTrue per request, while each fan-out page in triggers
 * several in parallel. With the old SYMMETRICAL secret (HS256), `getClaims()`
 * falls back exactly to `getUser()`: same behavior as before, so toggles
 * zero-regression which activates on its own once the keys are migrated.
 *
 * An unreachable Supabase instance (exhausted network retries, ~20 s) is NOT
 * an invalid session: disguising it as 401 makes it appear as a disconnection.
 * We respond to 503 with an explicit message in this case.
 *
 * ## Second factor (MIN-132)
 *
 * An account that has enrolled a TOTP factor is only served in `aal2`. The refusal is
 * GLOBAL and lives here rather than route by route: a list of sensitive routes
 * would require thinking about it for each addition, and the one we forget to complete is
 * a flaw that no test points out. As the challenge is posed just after the
 * password, a `aal1` session on a protected account means "connection
 * abandoned during the process" — refusing it does not break any normal usage.
 *
 * `allowAal1` is only there for the road recovery (`/api/account/mfa/recover`),
 * the only place that should respond to someone who NO LONGER has their phone.
 *
 * ## Origin of the request (MIN-345)
 *
 * These routes are authenticated by COOKIE, and a cookie goes away by itself. All the
 * CSRF protection was due to `SameSite=Lax` that of Supabase — solid, but
 * alone: ​​nothing here looked at where the call came from. A write that declares itself
 * from another origin is refused, and the refusal lives HERE for the same reason as
 * that of the second factor - a list of sensitive routes is a list that one
 * forgets to complete.
 *
 * What is NOT refused: a request which does not declare any origin. It cannot
 * come from a third party page (the browser would have asked it), and refusing
 * would drop callers without a page — probes, tests, online tools of
 * command. The full reasoning is in `lib/server/same-origin.ts`.
 */
export async function getAuthedUser(
  request: NextRequest,
  options?: { allowAal1?: boolean }
): Promise<AuthedResult> {
  if (isMutatingMethod(request.method) && hasForeignOrigin(request)) {
    console.error(
      `[api-auth] cross-origin ${request.method} refused: ` +
        `${request.headers.get("origin") ?? request.headers.get("referer")}`
    );
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const supabase = createSupabaseFromRequest(request);
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) {
    if (
      error &&
      (error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500)
    ) {
      const t = await getTranslations("ApiErrors");
      return {
        ok: false,
        response: NextResponse.json(
          { error: t("serviceUnavailable") },
          { status: 503 }
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!options?.allowAal1 && needsMfaChallenge(claims)) {
    const t = await getTranslations("ApiErrors");
    return {
      ok: false,
      response: NextResponse.json(
        { error: t("mfaRequired"), code: MFA_REQUIRED_CODE },
        { status: 403 }
      ),
    };
  }

  // The verified JWT claims carry whatever the handlers read (id via
  // `sub`, email, user_metadata, app_metadata). On reconstruit l'objet `User`
  // expected by callers from these claims — no network call
  // additional to fetch the full account.
  const user = {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    phone: typeof claims.phone === "string" ? claims.phone : undefined,
    role: typeof claims.role === "string" ? claims.role : undefined,
    aud: claims.aud,
    app_metadata: claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
    created_at: "",
  } as unknown as User;
  return { ok: true, user, supabase, claims: claims as unknown as Record<string, unknown> };
}
