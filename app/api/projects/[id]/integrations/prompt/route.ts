import { NextResponse, type NextRequest } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { isIntegrationKind } from "@/lib/feedback/integration-contract";
import { isWebhookEvent, isWebhookScope } from "@/lib/server/webhooks";
import { buildIntegrationPrompt } from "@/lib/server/integration-prompt";

type RouteContext = { params: Promise<{ id: string }> };

const PLACEMENT_MAX = 500;

/**
 * POST { kind, placement?, webhook? } — le prompt d'intégration d'une clé qui
 * EXISTE DÉJÀ.
 *
 * La route jumelle côté feedback (`/feedback/integration-prompt`) provisionne
 * en même temps qu'elle rédige : elle crée une clé pour pouvoir la montrer en
 * clair. Ici, la clé vient d'être créée par le wizard, et le prompt n'en porte
 * de toute façon aucune — il ne cite que la variable d'environnement. Rédiger
 * ne demande donc RIEN d'autre que le nom du projet : pas d'écriture, pas de
 * clé de plus à révoquer si l'utilisateur ferme la fenêtre.
 *
 * Réservé au owner comme le reste des intégrations : le texte décrit la surface
 * d'écriture du projet.
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  // `null` est du JSON valide : lire body.kind dessus ferait un 500.
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }
  if (!isIntegrationKind(body.kind)) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }
  const placement =
    typeof body.placement === "string"
      ? body.placement.trim().slice(0, PLACEMENT_MAX)
      : "";

  // Le webhook n'est décrit que s'il est réglé. On revalide ici ce que le
  // client annonce : le prompt dira au récepteur quels événements attendre, et
  // une liste inventée lui ferait écrire une route pour rien.
  const raw = body.webhook;
  let webhook = null;
  if (raw && typeof raw === "object") {
    const { url, events, scope } = raw as Record<string, unknown>;
    if (
      typeof url === "string" &&
      url.trim() &&
      Array.isArray(events) &&
      events.every(isWebhookEvent) &&
      isWebhookScope(scope)
    ) {
      webhook = { url: url.trim(), events, scope };
    }
  }

  const locale =
    (await getLocale()) === "fr" ? ("fr" as const) : ("en" as const);
  const prompt = buildIntegrationPrompt({
    // Une clé 'feedback' dépose du feedback par l'API : c'est le mode 'api'.
    mode: body.kind === "issues" ? "issues" : "api",
    locale,
    projectName: access.project.name,
    placement,
    origin: request.nextUrl.origin,
    webhook,
  });
  return NextResponse.json({ prompt });
}
