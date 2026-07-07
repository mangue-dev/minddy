import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { authenticateIntegrationKey } from "@/lib/server/integration-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { createIssueForProject } from "@/lib/server/create-issue";
import { toNamed } from "@/lib/server/auth-users";

const MAX_MESSAGE_LENGTH = 5000;
const TITLE_MAX = 80;

/**
 * POST /api/share-feedback — minddy's own feedback button (dogfooding). Any
 * logged-in user can send a message; the server relays it through the real
 * integration path using MINDDY_API_KEY, so it lands as a triage issue in
 * minddy's own project, attributed to the named integration. The sender's
 * identity travels in the description footer — the issue is NOT created in
 * their name (they are usually not a member of the target project).
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const rate = checkSessionRateLimit(auth.user.id, "share-feedback", { limit: 5 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rate.retryAfter },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const raw = (body as { message?: unknown })?.message;
  const message = typeof raw === "string" ? raw.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
  if (!message) {
    return NextResponse.json(
      { error: t("feedbackMessageRequired") },
      { status: 400 }
    );
  }

  const integrationAuth = await authenticateIntegrationKey(
    process.env.MINDDY_API_KEY
  );
  if (!integrationAuth.ok) {
    console.error("[share-feedback] MINDDY_API_KEY missing, invalid or revoked");
    return NextResponse.json({ error: t("feedbackUnavailable") }, { status: 503 });
  }

  // Title = first line, truncated; the full message stays in the description.
  const firstLine = message.split("\n", 1)[0].trim();
  const title =
    firstLine.length > TITLE_MAX ? `${firstLine.slice(0, TITLE_MAX - 1)}…` : firstLine;

  const named = toNamed(auth.user);
  const sender = named.full_name ?? named.email ?? auth.user.id;
  const senderLine =
    named.full_name && named.email ? `${sender} (${named.email})` : sender;

  const result = await createIssueForProject({
    projectId: integrationAuth.project.id,
    actorId: null,
    integrationId: integrationAuth.integration.id,
    input: {
      title,
      description: `${message}\n\n— ${senderLine}`,
      status: "triage",
    },
  });

  if (!result.ok) {
    console.error("[share-feedback] create failed:", result.errorKey ?? result.rawMessage);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
