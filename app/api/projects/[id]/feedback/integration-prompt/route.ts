import { NextResponse, type NextRequest } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { requireProjectMember } from "@/lib/server/feedback/team-guard";
import {
  enableBoardForProject,
  getBoardForProject,
  rotateSsoSecret,
} from "@/lib/server/feedback/boards";
import { createIntegration } from "@/lib/server/integrations";
import {
  buildIntegrationPrompt,
  type IntegrationPromptMode,
} from "@/lib/server/feedback/integration-prompt";

type RouteContext = { params: Promise<{ id: string }> };

const PLACEMENT_MAX = 500;

/**
 * POST { mode: 'board'|'api', sso?, placement? } — génère le prompt
 * d'intégration tout-en-un (MIN-37). Owner-only : la génération provisionne ce
 * qui manque — active le board (mode board), génère le secret SSO s'il n'existe
 * pas encore (sans jamais rotater un secret existant), crée une clé
 * d'intégration feedback neuve (mode api — la seule façon d'avoir la clé en
 * clair).
 *
 * Le secret SSO revient À PART du prompt (`sso_secret`), parce qu'il n'y est
 * plus : le prompt nomme la variable d'environnement, l'interface montre la
 * ligne à coller dans le `.env`. Un prompt de board public est ainsi un texte
 * sans credential — celui qu'on peut confier à Numo d'un clic.
 */
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
  // `null` est du JSON valide : lire body.mode dessus ferait un 500.
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }
  const mode = body.mode as IntegrationPromptMode;
  if (mode !== "board" && mode !== "api") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }
  const sso = body.sso === true;
  const placement =
    typeof body.placement === "string" ? body.placement.trim().slice(0, PLACEMENT_MAX) : "";

  const locale = (await getLocale()) === "fr" ? ("fr" as const) : ("en" as const);
  const origin = request.nextUrl.origin;
  const projectName = guard.access.project.name;

  if (mode === "board") {
    const board = await enableBoardForProject(id);
    if (!board) {
      return NextResponse.json({ error: t("databaseError") }, { status: 500 });
    }
    let ssoSecret: string | null = null;
    if (sso) {
      // Ne JAMAIS rotater un secret existant ici : une intégration SSO déjà
      // en place chez le client casserait silencieusement.
      ssoSecret = board.sso_secret ?? (await rotateSsoSecret(id));
      if (!ssoSecret) {
        return NextResponse.json({ error: t("databaseError") }, { status: 500 });
      }
    }
    const prompt = buildIntegrationPrompt({
      mode: "board",
      locale,
      projectName,
      placement,
      origin,
      boardUrl: `${origin}/f/${board.token}`,
      sso: !!ssoSecret,
    });
    return NextResponse.json({ prompt, board_enabled: true, sso_secret: ssoSecret });
  }

  // mode === "api" : une clé neuve à chaque génération (le clair n'est jamais
  // relisible) — visible et révocable dans Settings → Intégrations.
  const created = await createIntegration({
    projectId: id,
    actorId: guard.userId,
    name: locale === "fr" ? "Intégration app (prompt)" : "App integration (prompt)",
    kind: "feedback",
  });
  if (!created.ok) {
    return NextResponse.json({ error: t(created.errorKey) }, { status: created.status });
  }
  const prompt = buildIntegrationPrompt({
    mode: "api",
    locale,
    projectName,
    placement,
    origin,
    apiKey: created.key,
  });
  return NextResponse.json({ prompt, key_created: true });
}
