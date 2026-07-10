import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { authenticateIntegrationKey } from "@/lib/server/integration-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { upsertFeedbackUser } from "@/lib/server/feedback/identity";
import { createFeedbackPost } from "@/lib/server/feedback/posts";
import { toNamed } from "@/lib/server/auth-users";

const MAX_MESSAGE_LENGTH = 5000;
const TITLE_MAX = 80;

/**
 * POST /api/share-feedback — minddy's own feedback button (dogfooding, MIN-37).
 * Any logged-in user can send a message; the server relays it through the real
 * integration path using MINDDY_API_KEY, so it lands as a feedback post in
 * minddy's own project — same pipeline as any customer using the API channel
 * (identity vouched for by the server, embedding at submission, hourly AI
 * dedup, votable on the public board once it's enabled).
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

  // Title = first line, truncated; the full message stays in the body.
  const firstLine = message.split("\n", 1)[0].trim();
  const title =
    firstLine.length > TITLE_MAX ? `${firstLine.slice(0, TITLE_MAX - 1)}…` : firstLine;

  // The sender IS the identity: their post and vote follow them on the board
  // (pseudonymous publicly, real email team-side for follow-up).
  const named = toNamed(auth.user);
  const feedbackUser = await upsertFeedbackUser({
    projectId: integrationAuth.project.id,
    externalId: auth.user.id,
    email: named.email,
    name: named.full_name,
    verifiedVia: "api",
  });
  if (!feedbackUser) {
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  const result = await createFeedbackPost({
    projectId: integrationAuth.project.id,
    title,
    body: message,
    source: "api",
    authorId: feedbackUser.id,
  });

  if (!result.ok) {
    console.error("[share-feedback] create failed:", result.errorKey);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
