import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { canUseAutomations, canUseSmartAssign } from "@/lib/server/entitlements";
import { parseAutomations } from "@/lib/automations";
import { isValidKey, normalizeKey } from "@/lib/project-key";
import { normalizeLanguage, type FeedbackLanguage } from "@/lib/feedback/languages";
import type { Project } from "@/lib/types";

/**
 * Shared project-settings update core, used by PATCH /api/projects/[id] and the
 * assistant `update_project` tool. Only the owner can change a project's own
 * settings (name / key / color / smart assign); the write bypasses RLS
 * (client service) so ownership is enforced HERE, before touching the row.
 *
 * Field semantics mirror the route: `name` trimmed & required-if-present, `key`
 * normalized then validated, `color` nullable (any present value, null clears).
 * A unique-violation on `key` (23505) surfaces as `projectKeyAlreadyUsed`.
 * `smart_assign_enabled` is gated by the billing stub (`canUseSmartAssign`) on
 * enable; `smart_assign_rules` replaces the whole map, keys whitelisted to
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
        | "automationsNotAllowed"
        | "databaseError";
    };

// Length limits (MIN-118): beyond that we truncate, like the Smart rules
// Assign below. Color is a short token (hex or class), never text.
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
  // Numo feedback review: two plane-independent switches (the
  // disarming costs nothing — it’s arming them that consumes them, and the budget consumes them
  // referee at the time of the pass).
  if (typeof input.feedback_review_enabled === "boolean") {
    updates.feedback_review_enabled = input.feedback_review_enabled;
  }
  if (typeof input.feedback_review_skip_over_budget === "boolean") {
    updates.feedback_review_skip_over_budget = input.feedback_review_skip_over_budget;
  }
  // Translation of returns. Language codes are STANDARDIZED here and not taken
  // as is: they are then compared with each other (team language against
  // language detected versus whitelist), and two scripts of the same language
  // feraient deux langues qui ne se reconnaissent pas.
  if (typeof input.feedback_translate_enabled === "boolean") {
    updates.feedback_translate_enabled = input.feedback_translate_enabled;
  }
  if ("feedback_team_language" in input) {
    updates.feedback_team_language = normalizeLanguage(input.feedback_team_language);
  }
  if (Array.isArray(input.feedback_no_translate_languages)) {
    updates.feedback_no_translate_languages = [
      ...new Set(
        input.feedback_no_translate_languages
          .map(normalizeLanguage)
          .filter((code): code is FeedbackLanguage => code !== null)
      ),
    ];
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
  // Automations (MIN-147). Same shape as the neighbor, different gate:
  // `canUseAutomations` ALSO requires `allowAgents`, since a rule throws
  // agent runs. The RULES are written without gate - disarming them does not
  // costs nothing, it's the switch that allows the expense to pass.
  if (typeof input.automations_enabled === "boolean") {
    if (
      input.automations_enabled &&
      !(await canUseAutomations(access.project.owner_id))
    ) {
      return { ok: false, status: 403, errorKey: "automationsNotAllowed" };
    }
    updates.automations_enabled = input.automations_enabled;
  }
  if ("automations" in input) {
    // `parseAutomations` is the validation: tolerant by construction, it
    // let go of what she doesn't understand rather than refusing everything
    // registration for a malformed rule.
    updates.automations = parseAutomations(input.automations);
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
