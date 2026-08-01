import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { canUseSmartAssign } from "@/lib/server/entitlements";
import { isValidKey, normalizeKey } from "@/lib/project-key";
import type { Project } from "@/lib/types";

/**
 * Shared project-settings update core, used by PATCH /api/projects/[id] and the
 * assistant `update_project` tool. Only the owner may change a project's own
 * settings (name / key / color / smart assign); the write bypasses RLS
 * (service client) so ownership is enforced HERE, before touching the row.
 *
 * Field semantics mirror the route: `name` trimmed & required-if-present, `key`
 * normalized then validated, `color` nullable (any present value, null clears).
 * A unique-violation on `key` (23505) surfaces as `projectKeyAlreadyUsed`.
 * `smart_assign_enabled` is gated by the billing stub (`canUseSmartAssign`) on
 * activation; `smart_assign_rules` replaces the whole map, keys whitelisted to
 * the current team.
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
        | "smartAssignNotAllowed"
        | "databaseError";
    };

// Bornes de longueur (MIN-118) : au-delà on tronque, comme les règles Smart
// Assign plus bas. La couleur est un jeton court (hex ou classe), jamais un texte.
const MAX_NAME_LENGTH = 200;
const MAX_COLOR_LENGTH = 32;

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
    updates.name = name.slice(0, MAX_NAME_LENGTH);
  }
  if (typeof input.key === "string") {
    const key = normalizeKey(input.key);
    if (!isValidKey(key)) {
      return { ok: false, status: 400, errorKey: "invalidProjectKey" };
    }
    updates.key = key;
  }
  if ("color" in input) {
    updates.color =
      typeof input.color === "string" ? input.color.slice(0, MAX_COLOR_LENGTH) : null;
  }
  if (typeof input.auto_assign_enabled === "boolean") {
    updates.auto_assign_enabled = input.auto_assign_enabled;
  }
  // Revue Numo du feedback : deux interrupteurs indépendants du plan (les
  // désarmer ne coûte rien — c'est les armer qui consomme, et le budget les
  // arbitre au moment de la passe).
  if (typeof input.feedback_review_enabled === "boolean") {
    updates.feedback_review_enabled = input.feedback_review_enabled;
  }
  if (typeof input.feedback_review_skip_over_budget === "boolean") {
    updates.feedback_review_skip_over_budget = input.feedback_review_skip_over_budget;
  }
  if (typeof input.smart_assign_enabled === "boolean") {
    if (
      input.smart_assign_enabled &&
      !(await canUseSmartAssign(access.project.owner_id))
    ) {
      return { ok: false, status: 403, errorKey: "smartAssignNotAllowed" };
    }
    updates.smart_assign_enabled = input.smart_assign_enabled;
  }

  const service = getServiceClient();

  if (
    typeof input.smart_assign_rules === "object" &&
    input.smart_assign_rules !== null &&
    !Array.isArray(input.smart_assign_rules)
  ) {
    // Whitelist keys to the current team (owner + members) and keep only
    // non-empty texts — stale entries for removed members drop on save.
    const { data: memberRows } = await service
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId);
    const teamIds = new Set([
      access.project.owner_id as string,
      ...(memberRows ?? []).map((m) => m.user_id as string),
    ]);
    const rules: Record<string, string> = {};
    for (const [userId, rule] of Object.entries(input.smart_assign_rules)) {
      if (!teamIds.has(userId) || typeof rule !== "string") continue;
      const text = rule.trim();
      if (text) rules[userId] = text.slice(0, 500);
    }
    updates.smart_assign_rules = rules;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, status: 400, errorKey: "noFieldsToUpdate" };
  }
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
