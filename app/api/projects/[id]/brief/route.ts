import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { getProjectAccess } from "@/lib/server/project-access";
import { ensureUsageBudget } from "@/lib/server/usage";
import { isPlanLimitError, planLimitResponse } from "@/lib/server/plan-limit-error";
import { getServiceClient } from "@/lib/supabase-service";
import { proposeBacklogFromBrief } from "@/lib/server/brief-to-issues";
import { MAX_BRIEF_CHARS, MIN_BRIEF_CHARS } from "@/lib/seed/types";

type RouteContext = { params: Promise<{ id: string }> };

// Un seul appel modèle, mais sa sortie fait quarante tickets AVEC leurs
// descriptions : de l'ordre de la minute à écrire, mesuré sur un brief d'une
// page. Au-dessus du timeout de la passe elle-même, pour que ce soit elle qui
// tranche et pas la plateforme.
export const maxDuration = 180;

/**
 * POST /api/projects/[id]/brief — découpe un brief en objectifs + tickets
 * (MIN-172). Corps : `{ brief }`, le texte collé.
 *
 * Rend `{ proposal }`, une PROPOSITION. La route N'ÉCRIT RIEN : elle lit un
 * texte et appelle un modèle. Ce qui s'écrit, c'est ce que l'utilisateur aura
 * validé dans l'aperçu, par `/brief/apply`.
 *
 * `proposal: null` quand la passe n'a rien donné (drapeau coupé, clé absente,
 * appel raté) — l'amorce se rejoue, ou se saute.
 *
 * Réservée au propriétaire, comme l'import : c'est lui qui paye l'appel, et
 * c'est un lot de tickets d'un coup dans SON projet.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  // Un brief collé = un appel. Une dizaine par minute couvre largement le fait
  // de retoucher son texte et de relancer.
  const rl = checkSessionRateLimit(auth.user.id, "project-brief", { limit: 10 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  const t = await getTranslations("ApiErrors");

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }
  if (!access.isOwner) {
    return NextResponse.json({ error: t("importOwnerOnly") }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const raw = (body as { brief?: unknown } | null)?.brief;
  const brief = typeof raw === "string" ? raw.trim() : "";
  if (brief.length < MIN_BRIEF_CHARS) {
    return NextResponse.json({ error: t("briefTooShort") }, { status: 400 });
  }
  if (brief.length > MAX_BRIEF_CHARS) {
    return NextResponse.json({ error: t("briefTooLong") }, { status: 413 });
  }

  // Budget d'usage du plan (MIN-72). Contrairement à la proposition de
  // correspondance d'un import, la passe EST la fonctionnalité : sans elle il
  // n'y a rien à afficher, donc le budget épuisé se dit franchement.
  // Propriétaire seul ici : le déclencheur EST celui à qui l'usage s'impute.
  try {
    await ensureUsageBudget(auth.user.id);
  } catch (err) {
    if (isPlanLimitError(err)) return planLimitResponse(err);
    throw err;
  }

  const service = getServiceClient();
  const { data: project } = await service
    .from("projects")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  const proposal = await proposeBacklogFromBrief({
    brief,
    projectName: (project?.name as string | undefined) ?? "",
    userId: auth.user.id,
    projectId: id,
  });

  return NextResponse.json({ proposal });
}
