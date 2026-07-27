import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { isForgeApiError } from "@/lib/server/agent/forge";
import {
  deleteAgentBranches,
  previewAgentBranches,
} from "@/lib/server/git/branch-cleanup";

/**
 * Branches d'agent du dépôt lié (MIN-102) : GET rend TOUTES celles que minddy a
 * poussées et qui existent encore (avec leur état — PR fusionnée, refusée,
 * ouverte, ou aucune), POST supprime celles qu'on lui désigne.
 *
 * Owner uniquement — supprimer des branches distantes est du même ordre que
 * délier le dépôt. Le POST ne fait pas confiance à sa liste : le module serveur
 * recalcule l'aperçu et n'accepte que son intersection.
 */

type RouteContext = { params: Promise<{ id: string }> };

// Une suppression par branche, en séquence, chez la forge : même budget que les
// autres routes qui parlent au provider.
export const maxDuration = 60;

/** Plafond de sécurité du POST — bien au-delà d'un ménage réel. */
const MAX_BRANCHES_PER_REQUEST = 200;

/** Auth + owner du projet. Renvoie la réponse d'échec, ou null si ça passe. */
async function denyUnlessOwner(
  request: NextRequest,
  projectId: string,
): Promise<NextResponse | null> {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const access = await getProjectAccess(auth.user.id, projectId);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }
  if (!access.isOwner) {
    return NextResponse.json({ error: t("ownerOnly") }, { status: 403 });
  }
  return null;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const denied = await denyUnlessOwner(request, id);
  if (denied) return denied;

  try {
    const preview = await previewAgentBranches(id);
    if (!preview) {
      return NextResponse.json({ error: "noRepo", code: "noRepo" }, { status: 409 });
    }
    return NextResponse.json(preview);
  } catch (err) {
    const status = isForgeApiError(err) ? 502 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const denied = await denyUnlessOwner(request, id);
  if (denied) return denied;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const branches = (body as { branches?: unknown })?.branches;
  if (
    !Array.isArray(branches) ||
    branches.length === 0 ||
    branches.length > MAX_BRANCHES_PER_REQUEST ||
    !branches.every((b) => typeof b === "string" && b.length > 0)
  ) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  try {
    const results = await deleteAgentBranches(id, branches as string[]);
    if (!results) {
      return NextResponse.json({ error: "noRepo", code: "noRepo" }, { status: 409 });
    }
    return NextResponse.json({ results });
  } catch (err) {
    const status = isForgeApiError(err) ? 502 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
