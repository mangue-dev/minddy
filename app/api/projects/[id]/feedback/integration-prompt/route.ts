import { NextResponse, type NextRequest } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { requireProjectMember } from "@/lib/server/feedback/team-guard";
import {
  enableBoardForProject,
  rotateSsoSecret,
} from "@/lib/server/feedback/boards";
import { createIntegration } from "@/lib/server/integrations";
import {
  buildIntegrationPrompt,
  type IntegrationPromptMode,
} from "@/lib/server/integration-prompt";
import { canonicalAppOrigin } from "@/lib/server/app-origin";

type RouteContext = { params: Promise<{ id: string }> };

const PLACEMENT_MAX = 500;

/**
 * POST { mode: 'board'|'api', sso?, placement? } — generates the prompt
 * all-in-one integration tool (MIN-37). Owner-only: the generation provisions this
 * which is missing — activates the board (board mode), generates the SSO secret if it does not exist
 * not yet (without ever rotating an existing secret), creates a key
 * new feedback integration (api mode — the only way to have the key in
 * clair).
 *
 * The credentials return APART from the prompt (`sso_secret`, `api_key`), because
 * that they are no longer there: the prompt names the environment variable,
 * the interface shows the line to paste into the `.env`. The two prompts are
 * thus texts without secrets - this is what allows them to be entrusted to Numo with a
 * click, in one mode or the other.
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
  // `null` is valid JSON: reading body.mode on it would do a 500.
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
  const origin = canonicalAppOrigin();
  const projectName = guard.access.project.name;

  if (mode === "board") {
    const board = await enableBoardForProject(id);
    if (!board) {
      return NextResponse.json({ error: t("databaseError") }, { status: 500 });
    }
    let ssoSecret: string | null = null;
    if (sso) {
      // NEVER rotate an existing secret here: an SSO integration already
      // installed at the customer's premises would break silently.
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

  // mode === "api": a new key for each generation (the clear one is never
  // rereadable) — visible and revocable in Settings → Integrations.
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
  });
  return NextResponse.json({ prompt, key_created: true, api_key: created.key });
}
