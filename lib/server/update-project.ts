import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { isValidKey, normalizeKey } from "@/lib/project-key";
import type { Project } from "@/lib/types";

/**
 * Shared project-settings update core, used by PATCH /api/projects/[id] and the
 * assistant `update_project` tool. Only the owner may change a project's own
 * settings (name / key / color); the write bypasses RLS (service client) so
 * ownership is enforced HERE, before touching the row.
 *
 * Field semantics mirror the route: `name` trimmed & required-if-present, `key`
 * normalized then validated, `color` nullable (any present value, null clears).
 * A unique-violation on `key` (23505) surfaces as `projectKeyAlreadyUsed`.
 */
export type UpdateProjectResult =
  | { ok: true; project: Project }
  | {
      ok: false;
      status: number;
      errorKey:
        | "nameRequired"
        | "invalidProjectKey"
        | "projectKeyAlreadyUsed"
        | "noFieldsToUpdate"
        | "projectNotFound"
        | "ownerOnly"
        | "databaseError";
    };

export async function updateProjectSettings({
  projectId,
  actorId,
  input,
}: {
  projectId: string;
  actorId: string;
  input: Record<string, unknown>;
}): Promise<UpdateProjectResult> {
  const access = await getProjectAccess(actorId, projectId);
  if (!access) return { ok: false, status: 404, errorKey: "projectNotFound" };
  if (!access.isOwner) return { ok: false, status: 403, errorKey: "ownerOnly" };

  const updates: Record<string, unknown> = {};
  if (typeof input.name === "string") {
    const name = input.name.trim();
    if (!name) return { ok: false, status: 400, errorKey: "nameRequired" };
    updates.name = name;
  }
  if (typeof input.key === "string") {
    const key = normalizeKey(input.key);
    if (!isValidKey(key)) {
      return { ok: false, status: 400, errorKey: "invalidProjectKey" };
    }
    updates.key = key;
  }
  if ("color" in input) {
    updates.color = typeof input.color === "string" ? input.color : null;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, status: 400, errorKey: "noFieldsToUpdate" };
  }

  const service = getServiceClient();
  const { data, error } = await service
    .from("projects")
    .update(updates)
    .eq("id", projectId)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, status: 409, errorKey: "projectKeyAlreadyUsed" };
    }
    console.error("[update-project] failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data) return { ok: false, status: 404, errorKey: "projectNotFound" };
  return { ok: true, project: data as Project };
}
