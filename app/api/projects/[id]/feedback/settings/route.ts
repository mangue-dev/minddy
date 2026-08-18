import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getServiceClient } from "@/lib/supabase-service";
import { requireProjectMember } from "@/lib/server/feedback/team-guard";
import { isAccentColor } from "@/lib/feedback/accent";
import {
  clearSsoSecret,
  disableBoardForProject,
  enableBoardForProject,
  getBoardForProject,
  rotateBoardToken,
  rotateSsoSecret,
  setBoardAccent,
  setBoardAllowComments,
  setBoardShowCategories,
  setBoardShowViews,
  setBoardVisibleViews,
} from "@/lib/server/feedback/boards";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Feedback board settings (MIN-37). GET for any member; the mutations
 * (publication, token rotation, SSO secret) are owner-only, like
 * integrations. The SSO secret is only returned to the owner.
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
    allow_comments: board.allow_comments,
    accent_light: board.accent_light,
    accent_dark: board.accent_dark,
    token: board.token,
    sso_secret: isOwner ? board.sso_secret : null,
    sso_configured: board.sso_secret !== null,
  };
}

/** Shared project views — tab checklist material. */
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
  // `null` is valid JSON: reading body.enabled on it would make a 500.
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
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
  if (typeof body.allow_comments === "boolean") {
    const ok = await setBoardAllowComments(id, body.allow_comments);
    if (!ok) {
      return NextResponse.json({ error: t("databaseError") }, { status: 500 });
    }
  }
  // Optional accent (MIN-59): each field is either a valid hex or null
  // (return to default). A non-null non-hex value is rejected.
  const accentPatch: { accent_light?: string | null; accent_dark?: string | null } = {};
  for (const field of ["accent_light", "accent_dark"] as const) {
    if (field in body) {
      const value = body[field];
      if (value !== null && !isAccentColor(value)) {
        return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
      }
      accentPatch[field] = value as string | null;
    }
  }
  if (Object.keys(accentPatch).length > 0) {
    const ok = await setBoardAccent(id, accentPatch);
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
    // Only truly shared views of the project are retained.
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
    typeof body.allow_comments !== "boolean" &&
    Object.keys(accentPatch).length === 0 &&
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
  // `null` is valid JSON: reading body.action on it would do a 500.
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
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
