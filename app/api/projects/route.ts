import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import {
  canUseSmartAssign,
  ensureProjectLimit,
} from "@/lib/server/entitlements";
import {
  isPlanLimitError,
  planLimitResponse,
} from "@/lib/server/plan-limit-error";
import { seedDefaultCategories } from "@/lib/server/categories";
import { DEFAULT_CATEGORIES } from "@/lib/default-categories";
import { isValidKey, normalizeKey } from "@/lib/project-key";
import { normalizeLanguage } from "@/lib/feedback/languages";

// Length bounds (MIN-118) — same caps as updateProjectSettings:
// beyond that we truncate. Color is a short token, never text.
const MAX_NAME_LENGTH = 200;
const MAX_COLOR_LENGTH = 32;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/projects — list the caller's accessible (owned + member) projects. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  // RLS "projects_select" already scopes this to owner ∪ member.
  const { data, error } = await auth.supabase
    .from("projects")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[api/projects] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** POST /api/projects — create a project owned by the caller. */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const rl = checkSessionRateLimit(auth.user.id, "project-create");
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

  const name =
    typeof input.name === "string" ? input.name.trim().slice(0, MAX_NAME_LENGTH) : "";
  const key = normalizeKey(typeof input.key === "string" ? input.key : "");
  const color =
    typeof input.color === "string" ? input.color.slice(0, MAX_COLOR_LENGTH) : null;
  const smartAssignEnabled = input.smart_assign_enabled === true;
  const autoAssignEnabled = input.auto_assign_enabled === true;
  // The language of the interface at the time of creation becomes that of
  // the team, and it is to this that Numo will translate the foreign feedback. She
  // can ONLY be read from here: the app keeps it in a cookie, never on the account,
  // so a review pass that runs three days later has no way of
  // find her. Absent (agent call, script) → null, and the review drops
  // on the default locale of the app.
  const teamLanguage = normalizeLanguage(input.locale);
  // Customer-provided ID (creation wizard, MIN-62): the orb seed
  // generated is the project id, and the wizard shows it BEFORE creating. Without that
  // the preview would show one gradient, the project created another. A uuid v4 taken from
  // chance does not collide with anything; everything else is refused.
  const id =
    typeof input.id === "string" && UUID_RE.test(input.id) ? input.id : null;

  // The orb seed follows the same rule as the id, and for the same reason:
  // the wizard may have restarted the draw before the project exists, and
  // the preview he showed must be the one we create. Absent, the column
  // remains zero and it is the id that is used.
  const orbSeed =
    typeof input.orb_seed === "string" && UUID_RE.test(input.orb_seed)
      ? input.orb_seed
      : null;

  if (!name) {
    return NextResponse.json({ error: t("nameRequired") }, { status: 400 });
  }
  if (!isValidKey(key)) {
    return NextResponse.json(
      { error: t("invalidProjectKey") },
      { status: 400 }
    );
  }

  try {
    await ensureProjectLimit(auth.user.id);
    if (smartAssignEnabled && !(await canUseSmartAssign(auth.user.id))) {
      return NextResponse.json({ error: t("smartAssignNotAllowed") }, { status: 403 });
    }
  } catch (err) {
    if (isPlanLimitError(err)) return planLimitResponse(err);
    throw err;
  }

  const { data, error } = await auth.supabase
    .from("projects")
    .insert({
      ...(id ? { id } : {}),
      ...(orbSeed ? { orb_seed: orbSeed } : {}),
      owner_id: auth.user.id,
      name,
      key,
      color,
      smart_assign_enabled: smartAssignEnabled,
      auto_assign_enabled: autoAssignEnabled,
      ...(teamLanguage ? { feedback_team_language: teamLanguage } : {}),
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: t("projectKeyTaken", { key }) },
        { status: 409 }
      );
    }
    console.error("[api/projects] create failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  // The default categories, in the language of the person creating the project.
  // It was a Postgres trigger, which wrote six French names to all
  // world — the base does not know the language of the caller, the app does.
  const tCategories = await getTranslations("Categories.defaults");
  await seedDefaultCategories({
    projectId: data.id as string,
    names: Object.fromEntries(
      DEFAULT_CATEGORIES.map((category) => [category.key, tCategories(category.key)])
    ),
  });

  return NextResponse.json(data, { status: 201 });
}
