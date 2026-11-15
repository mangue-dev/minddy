import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import type { ForgeActor } from "@/lib/server/git/forge-actor";
import { isForgeApiError } from "./forge";
import { PrOperationInProgressError } from "./pr-operation-lock";
import { resolvePrScope, type PrScope } from "./pr-scope";
import { findPullRequest } from "./pull-requests";

/**
 * The HTTP boundary of the `pull-requests/[prId]/*` routes: authentication and
 * PR resolution, the forge identity a human gesture needs, and the
 * translation of forge errors to HTTP in one place.
 */

/**
 * Limits for free-form fields sent to the forge. GitHub limits comment bodies
 * to 65,536 characters and rejects longer requests.
 */
export const MAX_COMMENT_BODY_LENGTH = 65_536;
export const MAX_PATH_LENGTH = 1024;

/** Identity denial responses, in the order the user encounters them. */
const ACTOR_ERROR_KEYS = {
  noAccount: "gitAccountRequired",
  noRepoAccess: "gitRepoAccessRequired",
  noWriteAccess: "gitWriteAccessRequired",
  // Without this entry, a rejected token would reach the forge and come back
  // as a raw `Bad credentials` toast: GitHub's message, not ours.
  expired: "gitAccountExpired",
} as const;

/**
 * The actor, or the 403 that explains why there is none. The message is
 * translated here, on the server: the client shows `err.message` as a toast.
 *
 * Writes check again even when the UI already did: the capability cache is
 * warm, and the UI is never the guard.
 */
export async function requireActor(
  scope: PrScope,
  need: "read" | "write",
): Promise<
  | { ok: true; actor: Extract<ForgeActor, { kind: "actor" }> }
  | { ok: false; response: NextResponse }
> {
  const actor = await scope.actor();
  const reason =
    actor.kind === "none"
      ? actor.reason
      : need === "write" && actor.capability !== "write"
        ? "noWriteAccess"
        : null;
  if (!reason) {
    return { ok: true, actor: actor as Extract<ForgeActor, { kind: "actor" }> };
  }

  const code = ACTOR_ERROR_KEYS[reason];
  const t = await getTranslations("ApiErrors");
  return {
    ok: false,
    response: NextResponse.json(
      { error: t(code, { repo: scope.target.repoFullName }), code },
      { status: 403 },
    ),
  };
}

/** What a PR route does: `write` covers every gesture that reaches the forge or a ticket. */
export type PrAccess = "read" | "write";

export type PrRequestAuth =
  | { ok: true; scope: PrScope; userId: string; supabase: SupabaseClient }
  | { ok: false; response: NextResponse };

/** The one 404 of the PR routes: "this PR does not exist for you". */
function prNotFound(): NextResponse {
  return NextResponse.json({ error: "Pull request not found" }, { status: 404 });
}

/**
 * Auth + resolution of a `pull-requests/[prId]/…` route: the only thing that
 * these routes do before delegating. Each caller states whether it reads or
 * writes: a write needs write access to a linking project (MIN-693), a read
 * shares in-flight forge reads with concurrent display requests.
 */
export async function authorizePrRequest(
  request: NextRequest,
  prId: string,
  access: PrAccess,
): Promise<PrRequestAuth> {
  const readNotBefore = performance.now();
  const auth = await getAuthedUser(request);
  if (!auth.ok) return { ok: false, response: auth.response };

  const pr = await findPullRequest(prId);
  if (!pr) return { ok: false, response: prNotFound() };

  const scope = await resolvePrScope(auth.user.id, pr, access === "read", readNotBefore);
  if (!scope) return { ok: false, response: prNotFound() };
  if (access === "write" && !scope.canWrite) {
    const t = await getTranslations("ApiErrors");
    return {
      ok: false,
      response: NextResponse.json(
        { error: t("readOnlyProject"), code: "readOnlyProject" },
        { status: 403 },
      ),
    };
  }
  // Keep the authenticated client: its RLS is the guard when an action touches a
  // table beyond the PR. Manual ticket linking (MIN-163) rereads the ticket with
  // this client instead of duplicating a project-membership check.
  return { ok: true, scope, userId: auth.user.id, supabase: auth.supabase };
}

/** Forge error → HTTP status (502 = the forge responded no, 500 = us). */
export function forgeErrorResponse(err: unknown): NextResponse {
  if (!isForgeApiError(err)) {
    return NextResponse.json(
      { error: (err as Error).message, code: "internalError" },
      { status: 500 },
    );
  }
  const code =
    err.status === 401
      ? "forgeUnauthorized"
      : err.status === 403
        ? "permissionDenied"
        : err.status === 404
          ? "forgeResourceNotFound"
          : err.status === 409
            ? "forgeConflict"
            : err.status === 422
              ? "forgeRejected"
              : "forgeUnavailable";
  const status = err.status === 401 || err.status === 403 || err.status === 404 || err.status === 409 || err.status === 429
    ? err.status
    : 502;
  const retryAfter = typeof err.retryAfter === "string" ? err.retryAfter : null;
  return NextResponse.json({ error: err.message, code }, { status,
    ...(retryAfter ? { headers: { "Retry-After": retryAfter } } : {}) });
}

/** A gesture already running on this PR answers 409; anything else is a forge error. */
export function prOperationErrorResponse(err: unknown): NextResponse {
  if (err instanceof PrOperationInProgressError) {
    return NextResponse.json({ error: err.message, code: "operationInProgress" }, { status: 409 });
  }
  return forgeErrorResponse(err);
}
