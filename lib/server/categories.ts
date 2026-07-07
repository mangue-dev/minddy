import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { DEFAULT_CATEGORY_COLOR, isValidColor } from "@/lib/category-colors";

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
  const name = typeof input.name === "string" ? input.name.trim() : "";
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
