import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  deleteViewShare,
  getViewShare,
  upsertViewShare,
} from "@/lib/server/view-shares";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/views/[id]/share — current share state ({ share: null } = private). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await getViewShare(id, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ share: result.share });
}

/** PUT /api/views/[id]/share — share (or re-level) a view: { level, password? }. */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const { level, password } = (body ?? {}) as { level?: unknown; password?: unknown };
  if (level !== "password" && level !== "public") {
    return NextResponse.json({ error: t("invalidShareLevel") }, { status: 400 });
  }

  const result = await upsertViewShare({
    viewId: id,
    actorId: auth.user.id,
    level,
    password: typeof password === "string" ? password : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ share: result.share });
}

/** DELETE /api/views/[id]/share — back to private; the link stops working. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await deleteViewShare(id, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
