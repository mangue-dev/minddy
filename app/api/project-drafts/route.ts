import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

/**
 * Project creation drafts (`project_drafts` table, RLS
 * self-manage → cookie client, no service access required).
 *
 * This route is a WAREHOUSE, not a template: `data` is the state of the form
 * of the wizard, which moves with each step that is added to it, and it is the client who
 * knows how to proofread it (lib/project-draft.ts does it defensively). We therefore do not validate
 * here only what the database needs — an id, a name, a short step, an object —
 * plus a size ceiling, with the icon traveling there as a data URL.
 */

const MAX_NAME_LENGTH = 200;
const MAX_STEP_LENGTH = 40;
/** The complete draft, serialized. A compressed icon weighs a few dozen
 * of Ko: this ceiling leaves room, without letting a paperweight pass through. */
const MAX_DATA_BYTES = 512 * 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT = "id, name, step, data, updated_at";

/** GET /api/project-drafts — my drafts, from newest to oldest. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("project_drafts")
    .select(SELECT)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[api/project-drafts] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(data);
}

/**
 * PUT /api/project-drafts — pose ou remplace UN brouillon.
 *
 * An upsert by id, not a POST then PATCH: the id is that of the future
 * project, drawn by the wizard when it is opened, and the client does not know — does not have
 * namely — if this draft has already been written once.
 */
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
  // A draft with no name has nothing to show in the sidebar: the wizard
  // doesn't record any, and the road doesn't accept it either.
  if (!name) {
    return NextResponse.json({ error: t("nameRequired") }, { status: 400 });
  }
  if (!step) {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  if (JSON.stringify(data).length > MAX_DATA_BYTES) {
    return NextResponse.json({ error: t("draftTooLarge") }, { status: 413 });
  }

  // `user_id` explicit: the insertion policy requires it (with check), and it is
  // also what prevents overwriting someone else’s draft — the update policy
  // would otherwise see no lines to modify, and the upsert would create one.
  const { data: row, error } = await auth.supabase
    .from("project_drafts")
    .upsert(
      { id, user_id: auth.user.id, name, step, data },
      { onConflict: "id" }
    )
    .select(SELECT)
    .single();

  if (error) {
    console.error("[api/project-drafts] upsert failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(row);
}
