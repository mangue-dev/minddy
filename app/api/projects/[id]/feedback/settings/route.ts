import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireProjectMember } from "@/lib/server/feedback/team-guard";
import {
  clearSsoSecret,
  disableBoardForProject,
  enableBoardForProject,
  getBoardForProject,
  rotateBoardToken,
  rotateSsoSecret,
} from "@/lib/server/feedback/boards";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Réglages du board de feedback (MIN-37). GET pour tout membre ; les mutations
 * (publication, rotation du token, secret SSO) sont owner-only, comme les
 * intégrations. Le secret SSO n'est renvoyé qu'au owner.
 */

function boardPayload(
  board: Awaited<ReturnType<typeof getBoardForProject>>,
  isOwner: boolean
) {
  if (!board) return null;
  return {
    enabled: board.enabled,
    token: board.token,
    sso_secret: isOwner ? board.sso_secret : null,
    sso_configured: board.sso_secret !== null,
  };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;

  const board = await getBoardForProject(id);
  return NextResponse.json({ board: boardPayload(board, guard.access.isOwner) });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");
  if (!guard.access.isOwner) {
    return NextResponse.json({ error: t("ownerOnly") }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  if (body.enabled) {
    const board = await enableBoardForProject(id);
    if (!board) {
      return NextResponse.json({ error: t("databaseError") }, { status: 500 });
    }
    return NextResponse.json({ board: boardPayload(board, true) });
  }
  const ok = await disableBoardForProject(id);
  if (!ok) {
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  const board = await getBoardForProject(id);
  return NextResponse.json({ board: boardPayload(board, true) });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");
  if (!guard.access.isOwner) {
    return NextResponse.json({ error: t("ownerOnly") }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const board = await getBoardForProject(id);
  if (!board) {
    return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });
  }

  switch (body.action) {
    case "rotate_token": {
      const rotated = await rotateBoardToken(id);
      if (!rotated) {
        return NextResponse.json({ error: t("databaseError") }, { status: 500 });
      }
      return NextResponse.json({ board: boardPayload(rotated, true) });
    }
    case "rotate_sso": {
      const secret = await rotateSsoSecret(id);
      if (!secret) {
        return NextResponse.json({ error: t("databaseError") }, { status: 500 });
      }
      const fresh = await getBoardForProject(id);
      return NextResponse.json({ board: boardPayload(fresh, true) });
    }
    case "clear_sso": {
      const ok = await clearSsoSecret(id);
      if (!ok) {
        return NextResponse.json({ error: t("databaseError") }, { status: 500 });
      }
      const fresh = await getBoardForProject(id);
      return NextResponse.json({ board: boardPayload(fresh, true) });
    }
    default:
      return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }
}
