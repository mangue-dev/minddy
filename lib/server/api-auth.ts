import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
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
  backendFetchWithTimeout,
  isBackendUnavailableError,
} from "@/lib/backend-availability";
import { getServiceClient } from "@/lib/supabase-service";

export { createCookieSink, type CookieSink };

/**
 * Anon Supabase client bound to the request cookies (RLS-enforced). Route
 * handlers act *as the user*, so RLS does the tenant isolation — no service
 * client needed for project CRUD. `setAll` is a no-op: handlers don't refresh
 * cookies (the middleware / auth callback own that).
 */
export function createSupabaseFromRequest(request: NextRequest): SupabaseClient {
  return createServerClient(
    process.env.MINDDY_PUBLIC_SUPABASE_URL!,
    process.env.MINDDY_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: backendFetchWithTimeout },
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
 * Supabase client that records refreshed cookies for public routes (MIN-293).
 *
 * Reading an expired session rotates its refresh token. A cookie adapter that
 * discards the replacement leaves the browser holding the consumed token, so
 * the next refresh fails with `refresh_token_not_found`.
 *
 * Protected app routes do not need this adapter because `proxy.ts` refreshes
 * their cookies first. Public routes that inspect an optional session, such as
 * `/feedback`, must use this constructor and pass the response through
 * `applyCookies`. The shared cookie carrier lives in `lib/session-cookies.ts`
 * because the proxy cannot import this `server-only` module.
 */
export function createSupabaseWithCookieSink(
  request: NextRequest
): CookieSink & { supabase: SupabaseClient } {
  const sink = createCookieSink();
  const supabase = createServerClient(
    process.env.MINDDY_PUBLIC_SUPABASE_URL!,
    process.env.MINDDY_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: backendFetchWithTimeout },
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
  | { ok: false; response: NextResponse };

async function serviceUnavailableResult(): Promise<AuthedResult> {
  const t = await getTranslations("ApiErrors");
  return {
    ok: false,
    response: NextResponse.json(
      { error: t("serviceUnavailable") },
      { status: 503 },
    ),
  };
}

async function mfaRequiredResult(): Promise<AuthedResult> {
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
  if (error) throw new Error(error.message);
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
  let authResult: Awaited<ReturnType<typeof supabase.auth.getClaims>>;
  try {
    authResult = await supabase.auth.getClaims();
  } catch (error) {
    if (isBackendUnavailableError(error)) return serviceUnavailableResult();
    throw error;
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

  let liveState: { sessionActive: boolean; mfaAllowed: boolean };
  try {
    liveState = await liveAuthorizationState(
      claims.sub,
      sessionId,
      claims.aal,
      claims.amr,
      options?.allowAal1 === true,
    );
  } catch (liveAuthorizationError) {
    console.error(
      "[api-auth] live authorization check failed:",
      (liveAuthorizationError as Error).message,
    );
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

  // Reconstruct the partial User object that callers expect from verified JWT
  // claims without another account lookup.
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
