import { NextResponse, type NextRequest } from "next/server";
import { canonicalAppOrigin } from "@/lib/server/app-origin";
import { getLocale, getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { isIntegrationKind } from "@/lib/feedback/integration-contract";
import { isWebhookEvent, isWebhookScope } from "@/lib/server/webhooks";
import { buildIntegrationPrompt } from "@/lib/server/integration-prompt";

type RouteContext = { params: Promise<{ id: string }> };

const PLACEMENT_MAX = 500;

/**
 * POST { kind, placement?, webhook? } — the prompt for integrating a key that
 * ALREADY EXISTS.
 *
 * The twin route on the feedback side (`/feedback/integration-prompt`) provisions
 * at the same time as she writes: she creates a key to be able to show it in
 * clear. Here, the key has just been created by the wizard, and the prompt does not contain any
 * none anyway — it only quotes the environment variable. Write
 * therefore asks for NOTHING other than the name of the project: no writing, no
 * one more key to revoke if the user closes the window.
 *
 * Reserved for the owner like the rest of the integrations: the text describes the surface
 * writing the project.
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
  // `null` is valid JSON: reading body.kind on it would make a 500.
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

  // The webhook is only described if it is set. Here we revalidate what the
  // client announces: the prompt will tell the receiver what events to expect, and
  // an invented list would make him write a route for nothing.
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
    // A 'feedback' key provides feedback via the API: this is 'api' mode.
    mode: body.kind === "issues" ? "issues" : "api",
    locale,
    projectName: access.project.name,
    placement,
    origin: canonicalAppOrigin(),
    webhook,
  });
  return NextResponse.json({ prompt });
}
