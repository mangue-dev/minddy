import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
  isValidColor,
} from "@/lib/category-colors";
import { DEFAULT_CATEGORIES } from "@/lib/default-categories";

// Borne de longueur du nom (MIN-118) — une étiquette reste courte, au-delà on tronque.
const MAX_NAME_LENGTH = 200;

/**
 * Pose le jeu de catégories par défaut sur un projet neuf, dans la langue de
 * celui qui le crée (`names`, déjà traduits par l'appelant depuis
 * `Categories.defaults`).
 *
 * C'était un trigger Postgres, qui écrivait six noms français quelle que soit
 * la langue de l'utilisateur — voir `lib/default-categories.ts`. Comme pour les
 * vues par défaut (`ensureBaselineViews`), c'est désormais l'application qui
 * sème, parce qu'elle est le seul endroit qui connaît la langue.
 *
 * Ne sème QUE si le projet n'a aucune catégorie : rejouable, et sans risque de
 * doubler celles d'un projet qui en a déjà. Un échec est journalisé, jamais
 * levé — un projet créé sans ses étiquettes reste parfaitement utilisable, et
 * l'utilisateur peut les ajouter à la main.
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
 * Des NOMS d'étiquettes aux catégories du projet : celles qui existent sont
 * retrouvées à la casse près, les autres sont créées. Rend l'index nom
 * minuscule → id, ou `null` si la base a refusé (l'appelant décide alors s'il
 * abandonne ou s'il continue sans catégories).
 *
 * Partagé par l'import en masse (`importIssuesIntoProject`) et par la synchro
 * d'un dépôt lié, pour une raison qui n'est pas seulement la factorisation :
 * les deux voient les MÊMES étiquettes du même dépôt, à des moments différents
 * — le backfill à l'activation, puis un webhook `labeled` trois jours après. Un
 * rapprochement qui divergerait entre les deux créerait une seconde catégorie
 * « Bug » à côté de la première, et personne ne saurait pourquoi.
 *
 * Le rapprochement FIN (« Bugs » → la catégorie « Bug » du projet) a déjà eu
 * lieu en amont — c'est le nom VOULU qui arrive ici. Il ne reste que l'égalité.
 */
export async function resolveCategoryIdsByName(
  projectId: string,
  names: string[]
): Promise<{ idByKey: Map<string, string>; created: number } | null> {
  const idByKey = new Map<string, string>();
  // Première casse vue par nom minuscule : c'est elle qui sera écrite en base
  // si la catégorie doit être créée.
  const wanted = new Map<string, string>();
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!wanted.has(key)) wanted.set(key, trimmed);
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
  for (const cat of existing ?? []) {
    idByKey.set((cat.name as string).toLowerCase(), cat.id as string);
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
        name: name.slice(0, MAX_NAME_LENGTH),
        color: CATEGORY_COLORS[(offset + i) % CATEGORY_COLORS.length],
      }))
    )
    .select("id, name");
  if (createError) {
    console.error("[categories] resolve create failed:", createError.message);
    return null;
  }
  for (const cat of created ?? []) {
    idByKey.set((cat.name as string).toLowerCase(), cat.id as string);
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
  const name =
    typeof input.name === "string" ? input.name.trim().slice(0, MAX_NAME_LENGTH) : "";
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
    const name = input.name.trim();
    if (!name) return { ok: false, status: 400, errorKey: "nameRequired" };
    updates.name = name.slice(0, MAX_NAME_LENGTH);
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
