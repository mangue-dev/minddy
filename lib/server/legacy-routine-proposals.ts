import "server-only";
import { createHash } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import { decodeProject } from "@/lib/server/project-content";
import { createRoutine } from "@/lib/server/routines";
import { rulesForProject, parseAutomations, resolveAutomationEfforts, resolveAutomationStartDelayMinutes, type AutomationRule } from "@/lib/automations";
import { type RoutineCondition, type RoutineTrigger } from "@/lib/routine-triggers";

/** Convert archived configuration into reviewable proposals, never active authority. */
export function legacyRoutineProposals(rules: AutomationRule[], metadata: Record<string, unknown> | null) {
  const efforts = resolveAutomationEfforts(metadata);
  const delayMinutes = resolveAutomationStartDelayMinutes(metadata);
  return rules.filter(rule => rule.enabled && rule.when.type === "status_changed").flatMap(rule => {
    if (rule.when.type !== "status_changed") return [];
    return rule.when.to.map(status => {
      const children: RoutineCondition[] = [];
      const sizes = (rule.if.effort ?? ["xs", "s", "m", "l", "xl", "none"]).filter(e => e === "none" ? efforts.m : efforts[e]);
      if (sizes.length) children.push(sizes.includes("none") ? { operator: "or", children: [{ field: "effort", operator: "absent" }, ...(sizes.filter(e => e !== "none").length ? [{ field: "effort", operator: "in", value: sizes.filter(e => e !== "none") } as RoutineCondition] : [])] } : { field: "effort", operator: "in", value: sizes });
      if (rule.if.priority?.length) children.push({ field: "priority", operator: "in", value: rule.if.priority });
      if (rule.if.categoryIds?.length) children.push({ operator: "or", children: rule.if.categoryIds.map(id => ({ field: "category", operator: "contains", value: id })) });
      if (rule.if.assigned !== undefined) children.push({ field: "assignee", operator: rule.if.assigned ? "present" : "absent" });
      const trigger: RoutineTrigger = { type: "event", event: "issue.status_changed", status, delayMinutes, ...(children.length ? { conditions: { operator: "and", children } } : {}) };
      const sourceKey = createHash("sha256").update(JSON.stringify([rule.id, status])).digest("hex");
      const prompt = `Review and carry out this archived workflow for the triggering issue, using Minddy tools and delegating code only when needed. Ask the owner for input at every human checkpoint and whenever a decision is missing. Do not bypass checkpoints or claim a verification passed without checking it. Start with rule ${rule.id}; follow its actions and the relevant run_finished rules below. Respect the original source, effort, plan and priority constraints, checking constraints that are not represented in the trigger before doing work. If the original event source or an issue-specific override cannot be verified with available tools, ask the owner before proceeding. The original delay was ${delayMinutes} minutes; the trigger preserves it. This proposal starts paused. The whole occurrence, including workers, has a 15% monthly-budget spending cap unless the owner changes it.\n\nArchived workflow to review before activation:\n${JSON.stringify(rules, null, 2)}`;
      return { sourceKey, trigger, prompt, valid: sizes.length > 0 && prompt.length <= 20_000 };
    });
  });
}

/**
 * Turn the archived automations of owned project rows into paused proposals.
 * The caller reads the rows whole under the owner and live filters; rows of
 * another owner or in the trash are ignored here as well. Decodes run in
 * parallel; creation stays sequential so routine limits and source-key
 * de-duplication see each previous insert. Returns whether a routine was created.
 */
export async function prepareLegacyRoutineProposals(rows: Record<string, unknown>[], ownerId: string): Promise<boolean> {
  const archived = await Promise.all(rows.map(async row => {
    if (row.owner_id !== ownerId || row.deleted_at != null) return null;
    if (!row.automations_enabled && !row.encrypted_content && !parseAutomations(row.automations).length) return null;
    const project = await decodeProject(row, ownerId);
    return project.automations_enabled || parseAutomations(project.automations).length ? project : null;
  }));
  let created = false;
  for (const [index, project] of archived.entries()) {
    if (project && await createLegacyRoutineProposals(rows[index].id as string, ownerId, project)) created = true;
  }
  return created;
}

async function createLegacyRoutineProposals(projectId: string, ownerId: string, archived: Record<string, unknown>): Promise<boolean> {
  const service = getServiceClient();
  let created = false;
  const identity = await service.auth.admin.getUserById(ownerId);
  if (identity.error) throw new Error(identity.error.message);
  const metadata = identity.data.user?.user_metadata ?? null;
  for (const proposal of legacyRoutineProposals(rulesForProject(archived.automations, metadata), metadata)) {

    const existing = await service.from("agent_routines").select("id").eq("project_id", projectId).eq("legacy_source_key", proposal.sourceKey).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) continue;
    let result = await createRoutine({ projectId, actorId: ownerId, prompt: ((proposal.valid ? "" : "Owner review required: the original effort switches allow no matching issue or the archived workflow exceeds the instruction limit. This proposal cannot preserve all constraints in its trigger. Review the archived project workflow before enabling it.\n\n") + proposal.prompt).slice(0, 19_000), trigger: proposal.valid ? proposal.trigger : { type: "event", event: "issue.status_changed", status: proposal.trigger.type === "event" ? proposal.trigger.status : "triage" }, timezone: typeof metadata?.timezone === "string" ? metadata.timezone : "UTC", enabled: false, maxSpendPercent: 15, legacySourceKey: proposal.sourceKey });
    if (!result.ok && result.errorKey === "invalidTrigger") {
      result = await createRoutine({ projectId, actorId: ownerId,
        prompt: ("Owner review required: this archived workflow refers to deleted or unavailable filters. Review the original constraints below before enabling it.\n\n" + proposal.prompt).slice(0, 19_000),
        trigger: { type: "event", event: "issue.status_changed", status: proposal.trigger.type === "event" ? proposal.trigger.status : "triage" },
        timezone: "UTC", enabled: false, maxSpendPercent: 15, legacySourceKey: proposal.sourceKey });
    }
    if (!result.ok && result.errorKey !== "databaseError") throw new Error(`Archived routine proposal: ${result.errorKey}`);
    if (result.ok) created = true;
  }
  return created;
}
