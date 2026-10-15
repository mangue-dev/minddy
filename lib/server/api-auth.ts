import {
  supabaseServerFetchWithTimeout as supabaseServerFetch,
  withSupabaseAuthorizationGate,
} from "@/lib/server/supabase-fetch";
import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { MFA_REQUIRED_CODE } from "@/lib/mfa";
import { hasForeignOrigin, isMutatingMethod } from "@/lib/server/same-origin";
import {
  createCookieSink,
  SESSION_COOKIE_OPTIONS,
  type CookieSink,
} from "@/lib/session-cookies";
import {
  BACKEND_REQUEST_TIMEOUT_MS,
  isBackendUnavailableError,
} from "@/lib/backend-availability";
import { getServiceClient } from "@/lib/supabase-service";

export { createCookieSink, type CookieSink };

/**
 * Anon Supabase client bound to the request cookies (RLS-enforced). Route
 * handlers act as the user, so RLS enforces tenant isolation. API routes bypass
 * the page proxy and can renew an expired session themselves, especially on a
 * first mutation after desktop resume. Next merges mutable route-handler
 * cookies into the final response, including redirects and error responses.
 */
export function createSupabaseFromRequest(request: NextRequest): SupabaseClient {
  return createServerClient(
    process.env.MINDDY_PUBLIC_SUPABASE_URL!,
    process.env.MINDDY_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: supabaseServerFetch },
      cookieOptions: SESSION_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        async setAll(cookiesToSet) {
          const cookieStore = await cookies();
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            cookieStore.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS });
          }
        },
      },
    }
  );
}

/**
 * Supabase client that records refreshed cookies for public routes (MIN-293).
 *
 * Reading an expired session rotates its refresh token. A cookie adapter that
 * discards the replacement leaves the browser holding the consumed token, so
 * the next refresh fails with `refresh_token_not_found`.
 *
 * This explicit sink is useful outside a mutable route-handler cookie context.
 * Public routes that inspect an optional session, such as `/feedback`, use this
 * constructor and pass the response through `applyCookies`. The shared cookie
 * carrier lives in `lib/session-cookies.ts` because the proxy cannot import this
 * server-only module.
 */
export function createSupabaseWithCookieSink(
  request: NextRequest
): CookieSink & { supabase: SupabaseClient } {
  const sink = createCookieSink();
  const supabase = createServerClient(
    process.env.MINDDY_PUBLIC_SUPABASE_URL!,
    process.env.MINDDY_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: supabaseServerFetch },
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
       * Verified JWT claims. `user` is only a partial reconstruction, so
       * session fields such as `aal`, `amr`, and `session_id` remain here.
       */
      claims: Record<string, unknown>;
    }
  | AuthFailure;

type AuthFailure = { ok: false; response: NextResponse };

async function serviceUnavailableResult(): Promise<AuthFailure> {
  const t = await getTranslations("ApiErrors");
  return {
    ok: false,
    response: NextResponse.json(
      { error: t("serviceUnavailable") },
      { status: 503 },
    ),
  };
}

async function mfaRequiredResult(): Promise<AuthFailure> {
  const t = await getTranslations("ApiErrors");
  return {
    ok: false,
    response: NextResponse.json(
      { error: t("mfaRequired"), code: MFA_REQUIRED_CODE },
      { status: 403 },
    ),
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Checks the live refresh-backed session and current MFA state. Signed access
 * tokens remain valid until expiry after logout, factor removal, or enrollment,
 * so handlers that later use the service role cannot authorize from JWT claims
 * alone.
 */
async function liveAuthorizationState(
  userId: string,
  sessionId: string,
  aal: unknown,
  amr: unknown,
  skipMfa: boolean,
): Promise<{ sessionActive: boolean; mfaAllowed: boolean }> {
  const { data, error } = await getServiceClient()
    .rpc("auth_authorization_state", {
      p_user: userId,
      p_session: sessionId,
      p_aal: typeof aal === "string" ? aal : "",
      p_amr: Array.isArray(amr) ? amr : [],
    })
    .abortSignal(AbortSignal.timeout(BACKEND_REQUEST_TIMEOUT_MS));
  if (error) throw new Error("live_authorization_lookup_failed");
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    typeof data.sessionActive !== "boolean" ||
    typeof data.mfaAllowed !== "boolean"
  ) {
    throw new Error("live authorization returned an invalid response");
  }
  return {
    sessionActive: data.sessionActive,
    mfaAllowed: skipMfa || data.mfaAllowed,
  };
}

/**
 * Resolves the authenticated user of a route handler, or error response.
 *
 * JWT verification uses `getClaims()`. With asymmetric signing keys it remains
 * local (WebCrypto and a cached JWKS); with a legacy HS256 secret the SDK falls
 * back to `getUser()`. Every authenticated request then checks its live
 * refresh-backed session. Protected requests also check current MFA state,
 * because token claims may predate enrollment, removal, or revocation.
 *
 * An unreachable Supabase instance is not an invalid session. After the
 * bounded backend request fails, this function returns an explicit 503.
 *
 * ## Second factor (MIN-132)
 *
 * An account that has enrolled a TOTP factor is only served in `aal2`. This is a
 * global boundary rather than a route list, so new service-role handlers inherit
 * it. The live lookup closes the otherwise valid access-token window after MFA
 * is enabled in another session.
 *
 * `allowAal1` exists only for `/api/account/mfa/recover`, where a signed-in user
 * who lost the factor must be able to consume a recovery code.
 *
 * ## Origin of the request (MIN-345)
 *
 * These routes authenticate with cookies. Every mutating request that declares
 * a foreign origin is rejected here so newly added handlers inherit the same
 * CSRF boundary. Requests without an Origin or Referer remain supported for
 * non-browser clients; browsers provide an Origin for cross-site writes. The
 * complete decision logic lives in `lib/server/same-origin.ts`.
 */
export async function getAuthedUser(
  request: NextRequest,
  options?: { allowAal1?: boolean }
): Promise<AuthedResult> {
  if (isMutatingMethod(request.method) && hasForeignOrigin(request)) {
    console.error("[api-auth] cross_origin_request_refused");
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return authorizeUserClient(createSupabaseFromRequest(request), options);
}

type SessionClaims = NonNullable<
  Awaited<ReturnType<SupabaseClient["auth"]["getClaims"]>>["data"]
>["claims"];
type VerifiedSession = { ok: true; claims: SessionClaims; sessionId: string };

/** Verify the signed session locally; this performs no live lookup. */
async function verifySessionClaims(
  supabase: SupabaseClient,
): Promise<VerifiedSession | AuthFailure> {
  let authResult: Awaited<ReturnType<typeof supabase.auth.getClaims>>;
  try {
    authResult = await supabase.auth.getClaims();
  } catch {
    console.error("[api-auth] claims_verification_failed");
    return serviceUnavailableResult();
  }
  const { data, error } = authResult;
  const claims = data?.claims;
  if (!claims?.sub) {
    if (isBackendUnavailableError(error)) return serviceUnavailableResult();
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const sessionId =
    typeof claims.session_id === "string" ? claims.session_id : "";
  if (!UUID_PATTERN.test(sessionId)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, claims, sessionId };
}

// Reconstruct the partial User object that callers expect from verified JWT
// claims without another account lookup.
function userFromClaims(claims: SessionClaims): User {
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    phone: typeof claims.phone === "string" ? claims.phone : undefined,
    role: typeof claims.role === "string" ? claims.role : undefined,
    aud: claims.aud,
    app_metadata: claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
    created_at: "",
  } as unknown as User;
}

/** Map the live session and MFA state to the route's authorization result. */
async function authorizeVerifiedSession(
  supabase: SupabaseClient,
  { claims, sessionId }: VerifiedSession,
  options?: { allowAal1?: boolean },
): Promise<AuthedResult> {
  let liveState: { sessionActive: boolean; mfaAllowed: boolean };
  try {
    liveState = await liveAuthorizationState(
      claims.sub,
      sessionId,
      claims.aal,
      claims.amr,
      options?.allowAal1 === true,
    );
  } catch {
    console.error("[api-auth] live_authorization_check_failed");
    return serviceUnavailableResult();
  }
  if (!liveState.sessionActive) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!liveState.mfaAllowed) {
    return mfaRequiredResult();
  }

  const user = userFromClaims(claims);
  return { ok: true, user, supabase, claims: claims as unknown as Record<string, unknown> };
}

/**
 * Share the verified claims, live-session and MFA boundary with request-scoped
 * server components. The caller supplies its cookie-backed, RLS-enforced client;
 * this does not authorize a service client or weaken the route origin guard.
 */
export async function authorizeUserClient(
  supabase: SupabaseClient,
  options?: { allowAal1?: boolean },
): Promise<AuthedResult> {
  const verified = await verifySessionClaims(supabase);
  if (!verified.ok) return verified;
  return authorizeVerifiedSession(supabase, verified, options);
}

/** Reads that may start before the live check, through the RLS client only. */
export type RlsReads<T> = (verified: { user: User; supabase: SupabaseClient }) => Promise<T> | null;

export type AuthedReadsResult<T> =
  | (Extract<AuthedResult, { ok: true }> & { reads: Promise<T> | null })
  | AuthFailure;

/**
 * `getAuthedUser` for a read-only handler whose first queries use the user's
 * RLS client. PostgREST already runs its pre-request hook
 * (`public.enforce_mfa_aal`: MFA and live session) on those queries, so they
 * start while the Node live check is in flight instead of after it.
 *
 * The live result still decides the response. Until it succeeds, the reads
 * deliver no response and other Supabase clients send nothing (see
 * `withSupabaseAuthorizationGate`), so no body, header, log, decryption or
 * service-role read can depend on them. A denial aborts them and returns the
 * same 401, 403 MFA or 503 response as `getAuthedUser`.
 *
 * `readRls` receives the claims-derived user and the RLS client only. It must
 * not write or use the service client. It returns null to start nothing, for
 * example when a write such as cycle reconciliation must precede the reads.
 * The caller awaits the returned `reads`, which is the promise already started.
 */
export async function getAuthedUserWithRlsReads<T>(
  request: NextRequest,
  readRls: RlsReads<T>,
): Promise<AuthedReadsResult<T>> {
  if (isMutatingMethod(request.method) && hasForeignOrigin(request)) {
    console.error("[api-auth] cross_origin_request_refused");
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const supabase = createSupabaseFromRequest(request);
  const verified = await verifySessionClaims(supabase);
  if (!verified.ok) return verified;
  // Start the live lookup before, and therefore outside, the gate it controls.
  const live = authorizeVerifiedSession(supabase, verified);
  const authorized = live.then((result) => result.ok, () => false);
  const abort = new AbortController();
  const reads = withSupabaseAuthorizationGate(authorized, abort.signal, () => {
    // Even a synchronous failure must not answer before the live result.
    try {
      return readRls({ user: userFromClaims(verified.claims), supabase });
    } catch (error) {
      return Promise.reject(error);
    }
  });
  // The caller that awaits `reads` receives its failure; it is never unhandled.
  reads?.catch(() => undefined);

  const result = await live.catch((error: unknown) => {
    abort.abort();
    throw error;
  });
  if (!result.ok) {
    abort.abort();
    return result;
  }
  return { ...result, reads };
}
