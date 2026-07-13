import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getServiceClient } from "@/lib/supabase-service";
import { requireProjectMember } from "@/lib/server/feedback/team-guard";
import {
  clearSsoSecret,
  disableBoardForProject,
  enableBoardForProject,
  getBoardForProject,
  rotateBoardToken,
  rotateSsoSecret,
  setBoardShowCategories,
  setBoardShowViews,
  setBoardVisibleViews,
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
    show_views: board.show_views,
    visible_view_ids: board.visible_view_ids,
    show_categories: board.show_categories,
    token: board.token,
    sso_secret: isOwner ? board.sso_secret : null,
    sso_configured: board.sso_secret !== null,
  };
}

/** Les vues partagées du projet — la matière de la checklist des onglets. */
async function listSharedViews(projectId: string): Promise<{ id: string; name: string }[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("view_shares")
    .select("views!inner (id, name, project_id)")
    .eq("views.project_id", projectId)
    .order("created_at", { ascending: true });
  return (data ?? [])
    .map((row) => row.views as unknown as { id: string; name: string } | null)
    .filter((v): v is { id: string; name: string } => v !== null);
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;

  const [board, sharedViews] = await Promise.all([
    getBoardForProject(id),
    listSharedViews(id),
  ]);
  return NextResponse.json({
    board: boardPayload(board, guard.access.isOwner),
    shared_views: sharedViews,
  });
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
  if (typeof body.enabled === "boolean") {
    if (body.enabled) {
      const board = await enableBoardForProject(id);
      if (!board) {
        return NextResponse.json({ error: t("databaseError") }, { status: 500 });
      }
    } else {
      const ok = await disableBoardForProject(id);
      if (!ok) {
        return NextResponse.json({ error: t("databaseError") }, { status: 500 });
      }
    }
  }
  if (typeof body.show_views === "boolean") {
    const ok = await setBoardShowViews(id, body.show_views);
    if (!ok) {
      return NextResponse.json({ error: t("databaseError") }, { status: 500 });
    }
  }
  if (typeof body.show_categories === "boolean") {
    const ok = await setBoardShowCategories(id, body.show_categories);
    if (!ok) {
      return NextResponse.json({ error: t("databaseError") }, { status: 500 });
    }
  }
  if (body.visible_view_ids !== undefined) {
    if (
      !Array.isArray(body.visible_view_ids) ||
      body.visible_view_ids.length > 50 ||
      body.visible_view_ids.some((v) => typeof v !== "string")
    ) {
      return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
    }
    // Seules les vues réellement partagées du projet sont retenues.
    const known = new Set((await listSharedViews(id)).map((v) => v.id));
    const ids = (body.visible_view_ids as string[]).filter((v) => known.has(v));
    const ok = await setBoardVisibleViews(id, ids);
    if (!ok) {
      return NextResponse.json({ error: t("databaseError") }, { status: 500 });
    }
  }
  if (
    typeof body.enabled !== "boolean" &&
    typeof body.show_views !== "boolean" &&
    typeof body.show_categories !== "boolean" &&
    body.visible_view_ids === undefined
  ) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const board = await getBoardForProject(id);
  return NextResponse.json({
    board: boardPayload(board, true),
    shared_views: await listSharedViews(id),
  });
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
