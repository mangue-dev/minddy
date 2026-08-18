import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
  isValidColor,
} from "@/lib/category-colors";
import { DEFAULT_CATEGORIES } from "@/lib/default-categories";

// Name length limit (MIN-118) — a label remains short, beyond that it is truncated.
const MAX_NAME_LENGTH = 200;

/** The name as it will be WRITTEN in base: trimmed, then bounded. */
export const categoryName = (name: string): string =>
  name.trim().slice(0, MAX_NAME_LENGTH);

/**
 * The index key of a category name — the STORED name, in lowercase.
 *
 * It goes through truncation, and that is its whole point. Index on name
 * whole while writing the cut name makes a name of more than 200
 * characters never finds the line he has just created: the category
 * is not attached to the ticket, and a NEW one is created in the next pass —
 * to each webhook, endlessly, `categories` having no uniqueness on
 * `(project_id, name)`. Only GitLab can achieve it (255 title characters
 * of label, compared to 50 at GitHub and 60 after parsing a CSV), but it is
 * the kind of leak that no one will see.
 *
 * Exported so that callers don't have to BECOME the rule again: they
 * search with the raw name, the key is calculated here, once.
 */
export const categoryKey = (name: string): string =>
  categoryName(name).toLowerCase();

/**
 * Places the default set of categories on a new project, in the language of
 * the one who creates it (`names`, already translated by the caller from
 * `Categories.defaults`).
 *
 * It was a Postgres trigger, which wrote six French names whatever
 * the user's language — see `lib/default-categories.ts`. As for the
 * default views (`ensureBaselineViews`), it is now the application which
 * seme, because it is the only place that knows the language.
 *
 * ONLY sow if the project has no category: replayable, and without risk of
 * double those of a project that already has them. A failure is logged, never
 * lifted — a project created without its labels remains perfectly usable, and
 * the user can add them by hand.
 */
export async function seedDefaultCategories({
  projectId,
  names,
}: {
  projectId: string;
  names: Record<string, string>;
}): Promise<void> {
  const service = getServiceClient();

  const { count, error: countError } = await service
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (countError) {
    console.error("[categories] default seed lookup failed:", countError.message);
    return;
  }
  if (count) return;

  const { error } = await service.from("categories").insert(
    DEFAULT_CATEGORIES.map((category) => ({
      project_id: projectId,
      name: names[category.key] ?? category.key,
      color: category.color,
    }))
  );
  if (error) console.error("[categories] default seed failed:", error.message);
}

/**
 * From label NAMES to project categories: those that exist are
 * found at the scrapyard, the others are created. Returns index
 * `categoryKey(nom)` → id — to query WITH `categoryKey`, never with a
 * `toLowerCase()` house — or `null` if the base refused (the caller decides
 * then if he gives up or if he continues without categories).
 *
 * Shared by bulk import (`importIssuesIntoProject`) and by sync
 * of a linked repository, for a reason which is not only factorization:
 * both see the SAME labels from the same repository, at different times
 * — the backfill upon activation, then a `labeled` webhook three days later. A
 * a rapprochement that diverges between the two would create a second category
 * “Bug” next to the first, and no one would know why.
 *
 * The FIN reconciliation (“Bugs” → the “Bug” category of the project) has already had
 * place upstream — it’s the DESIRED name that arrives here. All that remains is equality.
 */
export async function resolveCategoryIdsByName(
  projectId: string,
  names: string[]
): Promise<{ idByKey: Map<string, string>; created: number } | null> {
  const idByKey = new Map<string, string>();
  // First case seen by key: it is this name which will be written in base if the
  // category must be created. It is already in its STORED form — the key to
  // drifts, so the two cannot diverge.
  const wanted = new Map<string, string>();
  for (const name of names) {
    const stored = categoryName(name);
    if (!stored) continue;
    const key = stored.toLowerCase();
    if (!wanted.has(key)) wanted.set(key, stored);
  }
  if (wanted.size === 0) return { idByKey, created: 0 };

  const service = getServiceClient();
  const { data: existing, error } = await service
    .from("categories")
    .select("id, name")
    .eq("project_id", projectId);
  if (error) {
    console.error("[categories] resolve lookup failed:", error.message);
    return null;
  }
  // `categoryKey` and not `toLowerCase`: a line written before the terminal of
  // MIN-118 can exceed 200 characters, and it must remain findable under the
  // truncated key — otherwise we make a duplicate cut right next to it.
  for (const cat of existing ?? []) {
    idByKey.set(categoryKey(cat.name as string), cat.id as string);
  }

  const missing = [...wanted].filter(([key]) => !idByKey.has(key));
  if (missing.length === 0) return { idByKey, created: 0 };

  // Continue the palette round-robin where the project's list left off.
  const offset = (existing ?? []).length;
  const { data: created, error: createError } = await service
    .from("categories")
    .insert(
      missing.map(([, name], i) => ({
        project_id: projectId,
        // Already in stored form (`categoryName` at the top of the function): the
        // truncating here would reopen the gap between the key and the written line.
        name,
        color: CATEGORY_COLORS[(offset + i) % CATEGORY_COLORS.length],
      }))
    )
    .select("id, name");
  if (createError) {
    console.error("[categories] resolve create failed:", createError.message);
    return null;
  }
  for (const cat of created ?? []) {
    idByKey.set(categoryKey(cat.name as string), cat.id as string);
  }
  return { idByKey, created: created?.length ?? 0 };
}

/**
 * Shared category-creation core, used by POST /api/projects/[id]/categories
 * and the assistant tools. An invalid or missing color silently falls back to
 * the default palette color (same as the route).
 *
 * Access is enforced HERE (the write bypasses RLS): the actor must be able to
 * access the project, otherwise it is reported as not found — the same signal
 * RLS invisibility gives.
 */
export type CategoryResult =
  | { ok: true; category: Record<string, unknown> }
  | {
      ok: false;
      status: number;
      /** Key into the ApiErrors i18n namespace (mutually exclusive with rawMessage). */
      errorKey?: "nameRequired" | "projectNotFound" | "databaseError";
      /** Verbatim DB message already meant for the user. */
      rawMessage?: string;
    };

export async function createCategory({
  projectId,
  actorId,
  input,
}: {
  projectId: string;
  actorId: string;
  input: Record<string, unknown>;
}): Promise<CategoryResult> {
  const name = typeof input.name === "string" ? categoryName(input.name) : "";
  if (!name) {
    return { ok: false, status: 400, errorKey: "nameRequired" };
  }
  const color = isValidColor(input.color) ? input.color : DEFAULT_CATEGORY_COLOR;

  const access = await getProjectAccess(actorId, projectId);
  if (!access) {
    return { ok: false, status: 404, errorKey: "projectNotFound" };
  }

  const service = getServiceClient();
  const { data, error } = await service
    .from("categories")
    .insert({ project_id: projectId, name, color })
    .select("*")
    .single();

  if (error) {
    console.error("[categories] create failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true, category: data };
}

/**
 * Rename / recolor a category. Used by the assistant `update_category` tool.
 * The category must belong to the project in scope (the access check gives the
 * same "not found" signal RLS invisibility would). An invalid color is rejected.
 */
export type UpdateCategoryResult =
  | { ok: true; category: Record<string, unknown> }
  | {
      ok: false;
      status: number;
      errorKey?:
        | "nameRequired"
        | "invalidColor"
        | "noFieldsToUpdate"
        | "categoryNotFound"
        | "projectNotFound"
        | "databaseError";
      rawMessage?: string;
    };

export async function updateCategory({
  categoryId,
  projectId,
  actorId,
  input,
}: {
  categoryId: string;
  projectId: string;
  actorId: string;
  input: Record<string, unknown>;
}): Promise<UpdateCategoryResult> {
  const access = await getProjectAccess(actorId, projectId);
  if (!access) return { ok: false, status: 404, errorKey: "projectNotFound" };

  const updates: Record<string, unknown> = {};
  if (typeof input.name === "string") {
    const name = categoryName(input.name);
    if (!name) return { ok: false, status: 400, errorKey: "nameRequired" };
    updates.name = name;
  }
  if ("color" in input) {
    if (!isValidColor(input.color)) {
      return { ok: false, status: 400, errorKey: "invalidColor" };
    }
    updates.color = input.color;
  }
  if (Object.keys(updates).length === 0) {
    return { ok: false, status: 400, errorKey: "noFieldsToUpdate" };
  }

  const service = getServiceClient();
  const { data, error } = await service
    .from("categories")
    .update(updates)
    .eq("id", categoryId)
    .eq("project_id", projectId)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[categories] update failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data) return { ok: false, status: 404, errorKey: "categoryNotFound" };
  return { ok: true, category: data };
}
