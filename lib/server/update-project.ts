import { projectForClient } from "@/lib/server/project-content";
import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { canUseSmartAssign } from "@/lib/server/entitlements";
import { isValidKey, normalizeKey } from "@/lib/project-key";
import { normalizeLanguage, type FeedbackLanguage } from "@/lib/feedback/languages";
import { parseSmartTriageMode } from "@/lib/smart-triage";
import { parseSmartAssignFromStatus, smartAssignFromStatusOf } from "@/lib/smart-assign-config";
import type { Project } from "@/lib/types";
import { decodeProject, encodeProject, projectContentValues } from
  "@/lib/server/project-content";
import { mergeAiInstructions, normalizeAiLanguage, sameAiInstructions, type AiInstructions } from
  "@/lib/ai-instructions";
import { readAiInstructions, writeAiInstructions } from "@/lib/server/ai-instructions";

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
 * enable; `smart_assign_rules` replaces the whole map, with keys restricted to
 * the current team. `smart_assign_from_status` only accepts the known start
 * statuses. `smart_triage_mode` only accepts deterministic rules.
 *
 * `ai_language` (MIN-988) is the project's working language, a code from the
 * application's closed list or null to follow each text. `ai_instructions`
 * is a PARTIAL map: a use case that is passed replaces that instruction, an
 * empty text removes it, a use case left out keeps its text. The instructions
 * live in their own sealed row and are written last, once the project row
 * accepted every other field; the returned project carries the resulting map.
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
        | "invalidSmartAssignFromStatus"
        | "invalidSmartTriageMode"
        | "invalidAiLanguage"
        | "projectAutomationsRetired"
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

  if ("automations_enabled" in input || "automations" in input) {
    return { ok: false, status: 400, errorKey: "projectAutomationsRetired" };
  }
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
    // The date Smart Assign was turned on decides which empty assignees it
    // will fill (MIN-903). Turning it off drops a backfill still in progress.
    if (input.smart_assign_enabled && !access.project.smart_assign_enabled) {
      updates.smart_assign_enabled_at = new Date().toISOString();
    }
    if (!input.smart_assign_enabled) {
      updates.smart_assign_backfill_requested_at = null;
    }
  }
  if ("smart_assign_from_status" in input) {
    const fromStatus = parseSmartAssignFromStatus(input.smart_assign_from_status);
    if (!fromStatus) {
      return { ok: false, status: 400, errorKey: "invalidSmartAssignFromStatus" };
    }
    updates.smart_assign_from_status = fromStatus;
    // Lowering the start status to backlog makes Smart Assign cover backlog
    // issues from now on (MIN-957). The ones already there are left to the
    // backfill the settings offer, so they keep reading "Unassigned": the
    // date that separates the two moves with the setting.
    const enabledAfter =
      typeof updates.smart_assign_enabled === "boolean"
        ? updates.smart_assign_enabled
        : access.project.smart_assign_enabled === true;
    if (
      fromStatus === "backlog" &&
      smartAssignFromStatusOf(access.project) !== "backlog" &&
      enabledAfter
    ) {
      updates.smart_assign_enabled_at = new Date().toISOString();
    }
  }
  if ("ai_language" in input) {
    const language = normalizeAiLanguage(input.ai_language);
    // Null clears the setting; an unknown code is refused rather than read
    // as "clear", which would silently change the language of every title.
    if (input.ai_language !== null && !language) {
      return { ok: false, status: 400, errorKey: "invalidAiLanguage" };
    }
    updates.ai_language = language;
  }
  if ("smart_triage_mode" in input) {
    const mode = parseSmartTriageMode(input.smart_triage_mode);
    if (!mode) {
      return { ok: false, status: 400, errorKey: "invalidSmartTriageMode" };
    }
    updates.smart_triage_mode = mode;
  }

  const service = getServiceClient();

  if (
    typeof input.smart_assign_rules === "object" &&
    input.smart_assign_rules !== null &&
    !Array.isArray(input.smart_assign_rules)
  ) {
    // Whitelist keys to the current assignable team (owner + members with
    // the member role; readers are not candidates, MIN-693) and keep only
    // non-empty texts — stale entries for removed members drop on save.
    const { data: memberRows } = await service
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId)
      .eq("role", "member");
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

  // The instructions as they will be once this update is written, or null
  // when the input does not touch them.
  let instructions: AiInstructions | null = null;
  if (
    typeof input.ai_instructions === "object" &&
    input.ai_instructions !== null &&
    !Array.isArray(input.ai_instructions)
  ) {
    try {
      const current = await readAiInstructions(service, projectId, actorId);
      const merged = mergeAiInstructions(current, input.ai_instructions);
      instructions = sameAiInstructions(current, merged) && Object.keys(updates).length > 0
        ? null
        : merged;
    } catch {
      console.error("[update-project] failed: ai_instructions_unreadable");
      return { ok: false, status: 500, errorKey: "databaseError" };
    }
  }
  const withInstructions = async (project: Project): Promise<UpdateProjectResult> => {
    if (!instructions) return { ok: true, project };
    try {
      const saved = await writeAiInstructions(service, projectId, actorId, instructions);
      return { ok: true, project: { ...project, ai_instructions: saved } };
    } catch {
      console.error("[update-project] failed: ai_instructions_unwritable");
      return { ok: false, status: 500, errorKey: "databaseError" };
    }
  };

  if (Object.keys(updates).length === 0) {
    if (!instructions) return { ok: false, status: 400, errorKey: "noFieldsToUpdate" };
    // Only the instructions change: the project row is read, not written.
    const { data, error } = await service.from("projects").select("*")
      .eq("id", projectId).is("deleted_at", null).maybeSingle();
    if (error) return { ok: false, status: 500, errorKey: "databaseError" };
    if (!data) return { ok: false, status: 404, errorKey: "projectNotFound" };
    if (data.owner_id !== actorId) return { ok: false, status: 403, errorKey: "ownerOnly" };
    return withInstructions({ ...projectForClient(await decodeProject(data, actorId)),
      my_role: "owner", my_can_comment: true } as unknown as Project);
  }
  const contentChange = ["name", "smart_assign_rules"]
    .some((key) => Object.hasOwn(updates, key));
  if (contentChange) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const read = await service.from("projects").select("*")
        .eq("id", projectId).is("deleted_at", null).maybeSingle();
      if (read.error) return { ok: false, status: 500, errorKey: "databaseError" };
      if (!read.data) return { ok: false, status: 404, errorKey: "projectNotFound" };
      if (read.data.owner_id !== actorId) {
        return { ok: false, status: 403, errorKey: "ownerOnly" };
      }
      const plain = await decodeProject(read.data, actorId);
      const encoded = await encodeProject({ ...plain,
        name: updates.name ?? plain.name,
        automations: updates.automations ?? plain.automations,
        smart_assign_rules: updates.smart_assign_rules ?? plain.smart_assign_rules,
        encryption_version: read.data.encryption_version });
      const write = await service.from("projects")
        .update({ ...updates, ...projectContentValues(encoded) })
        .eq("id", projectId).eq("owner_id", actorId)
        .eq("content_revision", read.data.content_revision)
        .is("deleted_at", null).select("*").maybeSingle();
      if (write.error) {
        if (write.error.code === "23505") {
          return { ok: false, status: 409, errorKey: "projectKeyAlreadyUsed" };
        }
        console.error("[update-project] failed:", write.error.message);
        return { ok: false, status: 500, errorKey: "databaseError" };
      }
      if (write.data) {
        return withInstructions({ ...projectForClient(await decodeProject(write.data, actorId)),
          // Settings are owner-only, so the writer is the owner (MIN-693).
          my_role: "owner", my_can_comment: true } as unknown as Project);
      }
    }
    return { ok: false, status: 409, errorKey: "databaseError" };
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
  return withInstructions({ ...projectForClient(await decodeProject(data, actorId)),
          // Settings are owner-only, so the writer is the owner (MIN-693).
          my_role: "owner", my_can_comment: true } as unknown as Project);
}
