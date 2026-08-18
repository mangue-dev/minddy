import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import { regenerateProjectOrbSeed } from "@/lib/server/project-orb";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Project orb — owner only.
 *
 * POST → restarts the draw and responds { orb_seed }. It's the only hold we have
 * on the orb: it cannot be chosen, exactly like the avatar of an account
 * (`/api/me/avatar`). She lives next to `…/icon` and not in it, because it
 * is not the same resource: the icon is an imported image, the orb is this
 * that appears when there is no icon.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }
  if (!access.isOwner) {
    return NextResponse.json({ error: t("ownerOnly") }, { status: 403 });
  }

  // A button that can be hammered: the ceiling is there for the base, not against it
  // the user — restart ten times in a row to find its color is
  // exactly the intended use.
  const refused = rateLimitRefusal(auth.user.id, "orb-reroll", { limit: 60 });
  if (refused) return refused;

  try {
    return NextResponse.json({ orb_seed: await regenerateProjectOrbSeed(id) });
  } catch (err) {
    console.error("[api/projects/orb] regenerate failed:", err);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
