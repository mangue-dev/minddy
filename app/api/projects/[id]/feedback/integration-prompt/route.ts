import { NextResponse, type NextRequest } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { requireProjectMember } from "@/lib/server/feedback/team-guard";
import {
  enableBoardForProject,
  getOrCreateSsoSecret,
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
 * POST { mode: 'board'|'api', sso?, placement? } generates the all-in-one
 * integration prompt (MIN-37). Owner-only generation provisions what is
 * missing: it enables the board, initializes SSO without rotating an existing
 * secret, or creates a new feedback integration key.
 *
 * Credentials are returned separately from the prompt. The prompt names the
 * environment variable while the interface shows the line to paste into
 * `.env`, so either prompt can be handed to Numo without exposing a secret.
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
      ssoSecret = await getOrCreateSsoSecret(id);
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
