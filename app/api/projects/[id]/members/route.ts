import { loadProjectMembers } from "@/lib/server/project-working-set-readers";
import { NextResponse, type NextRequest } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { canonicalAppOrigin } from "@/lib/server/app-origin";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import {
  cancelInvitation,
  inviteMember,
  removeMember,
  transferProjectOwnership,
  updateInvitationRole,
  updateMemberRole,
} from "@/lib/server/members";
import type { Locale } from "@/i18n/config";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/members — members + pending invitations (any accessible user). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");
  const result = await loadProjectMembers(auth, id);
  if (!result.ok) return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  return NextResponse.json(result.data);
}

/** POST /api/projects/[id]/members — owner invites by email. The address does not require
 * an existing minddy account: the durable invitation attaches when that address
 * later completes registration. Email delivery is optional. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  // Invitation writes are deliberately below the default 60/min. Twenty per
  // minute already allows an invitation every three seconds; more is not a
  // human invitation workflow.
  const rl = checkSessionRateLimit(auth.user.id, "project-members-write", {
    limit: 20,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const input = (body ?? {}) as { email?: unknown; role?: unknown; can_comment?: unknown };
  const result = await inviteMember({
    projectId: id,
    actorId: auth.user.id,
    email: input.email,
    role: input.role ?? "member",
    canComment: input.can_comment ?? false,
    // The email link must return to THIS deployment (dev, preview, prod) —
    // otherwise a local test sends the guest to production. It is read in
    // the ENVIRONMENT and not in the request (MIN-351): `X-Forwarded-Host` is
    // chosen by the caller, and the acceptance token therefore went to the
    // domain that it designated, in an e-mail sent by us.
    origin: canonicalAppOrigin(),
    // We do not know the language of the guest: we take that of the inviter,
    // who is the person from whom he expects the message.
    locale: (await getLocale()) as Locale,
  });
  if (!result.ok) {
    // `errorParams` carries the `{limit}` of `memberLimitReached`: a message to
    // placeholder called without its values ​​would display its key path.
    return NextResponse.json(
      { error: t(result.errorKey, result.errorParams) },
      { status: result.status }
    );
  }
  return NextResponse.json(result.invitation, { status: 201 });
}

/**
 * PATCH /api/projects/[id]/members — owner-only permission changes (MIN-693):
 *   { userId, role, can_comment? }       change a member's role or reader option
 *   { invitationId, role, can_comment }  change a pending invitation's role
 *   { transferTo }                       hand ownership to an existing member
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const rl = checkSessionRateLimit(auth.user.id, "project-members-write", {
    limit: 20,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  const t = await getTranslations("ApiErrors");

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  if (typeof body.transferTo === "string") {
    const result = await transferProjectOwnership({
      projectId: id,
      actorId: auth.user.id,
      newOwnerId: body.transferTo,
    });
    if (!result.ok) {
      return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
    }
    return NextResponse.json({ ok: true, disabledRoutines: result.disabledRoutines });
  }

  if (typeof body.invitationId === "string") {
    const result = await updateInvitationRole({
      projectId: id,
      actorId: auth.user.id,
      invitationId: body.invitationId,
      role: body.role,
      canComment: body.can_comment ?? false,
    });
    if (!result.ok) {
      return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
    }
    return NextResponse.json({ ok: true, role: result.role, can_comment: result.canComment });
  }

  if (typeof body.userId === "string") {
    const result = await updateMemberRole({
      projectId: id,
      actorId: auth.user.id,
      userId: body.userId,
      role: body.role,
      canComment: body.can_comment,
    });
    if (!result.ok) {
      return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
    }
    return NextResponse.json({
      ok: true,
      role: result.role,
      can_comment: result.canComment,
      unassigned: result.unassigned,
    });
  }

  return NextResponse.json({ error: t("missingParameter") }, { status: 400 });
}

/** DELETE /api/projects/[id]/members?invitationId=… | ?userId=… */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { searchParams } = new URL(request.url);
  const invitationId = searchParams.get("invitationId");
  const userId = searchParams.get("userId");

  // Cancel a pending invitation (owner only).
  if (invitationId) {
    const result = await cancelInvitation({
      projectId: id,
      actorId: auth.user.id,
      invitationId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  }

  // Remove a member — owner removes anyone, a member removes themselves (leave).
  if (userId) {
    const result = await removeMember({
      projectId: id,
      actorId: auth.user.id,
      userId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: t("missingParameter") }, { status: 400 });
}
