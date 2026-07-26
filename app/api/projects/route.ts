import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
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
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const key = normalizeKey(typeof input.key === "string" ? input.key : "");
  const color = typeof input.color === "string" ? input.color : null;
  const smartAssignEnabled = input.smart_assign_enabled === true;
  const autoAssignEnabled = input.auto_assign_enabled === true;

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
      owner_id: auth.user.id,
      name,
      key,
      color,
      smart_assign_enabled: smartAssignEnabled,
      auto_assign_enabled: autoAssignEnabled,
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

  // Les catégories par défaut, dans la langue de celui qui crée le projet.
  // C'était un trigger Postgres, qui écrivait six noms français à tout le
  // monde — la base ne connaît pas la langue de l'appelant, l'app si.
  const tCategories = await getTranslations("Categories.defaults");
  await seedDefaultCategories({
    projectId: data.id as string,
    names: Object.fromEntries(
      DEFAULT_CATEGORIES.map((category) => [category.key, tCategories(category.key)])
    ),
  });

  return NextResponse.json(data, { status: 201 });
}
