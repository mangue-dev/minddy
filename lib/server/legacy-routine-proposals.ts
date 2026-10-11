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

export async function prepareLegacyRoutineProposals(projectId: string, ownerId: string): Promise<void> {
  const service = getServiceClient();
  const { data: row, error } = await service.from("projects").select("*").eq("id", projectId).eq("owner_id", ownerId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row || !row.automations_enabled && !row.encrypted_content && !parseAutomations(row.automations).length) return;
  const archived = await decodeProject(row, ownerId);
  if (!archived.automations_enabled && !parseAutomations(archived.automations).length) return;
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
  }
}
