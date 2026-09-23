import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { listProjectDrafts, saveProjectDraft } from "@/lib/server/project-draft-store";

/**
 * Project creation drafts are private to their owner. The repository encrypts
 * the name and arbitrary wizard state before storing them.
 */

const MAX_NAME_LENGTH = 200;
const MAX_STEP_LENGTH = 40;
/** The complete draft can include a compressed icon data URL. */
const MAX_DATA_BYTES = 512 * 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/project-drafts — my drafts, from newest to oldest. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  try {
    return NextResponse.json(await listProjectDrafts(auth.supabase, auth.user.id));
  } catch {
    console.error("[api/project-drafts] list failed");
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}

/** PUT /api/project-drafts — create or replace one draft by its future project ID. */
export async function PUT(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const rl = checkSessionRateLimit(auth.user.id, "project-draft");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;

  const id = typeof input.id === "string" && UUID_RE.test(input.id) ? input.id : null;
  const name =
    typeof input.name === "string"
      ? input.name.trim().slice(0, MAX_NAME_LENGTH)
      : "";
  const step =
    typeof input.step === "string" ? input.step.slice(0, MAX_STEP_LENGTH) : "";
  const data =
    input.data && typeof input.data === "object" && !Array.isArray(input.data)
      ? (input.data as Record<string, unknown>)
      : {};

  if (!id) {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  // A nameless draft cannot be identified in the sidebar.
  if (!name) {
    return NextResponse.json({ error: t("nameRequired") }, { status: 400 });
  }
  if (!step) {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  if (JSON.stringify(data).length > MAX_DATA_BYTES) {
    return NextResponse.json({ error: t("draftTooLarge") }, { status: 413 });
  }

  try {
    const row = await saveProjectDraft(auth.supabase, auth.user.id, { id, name, step, data });
    return NextResponse.json(row);
  } catch {
    console.error("[api/project-drafts] save failed");
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
