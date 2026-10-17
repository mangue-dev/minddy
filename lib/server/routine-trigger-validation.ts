import { categoryStore } from "@/lib/server/category-store";
import "server-only";
import { getServiceClient } from "@/lib/supabase-service";
import { decodePage } from "@/lib/server/page-content";
import { issueInProject, userCanBeAssigned } from "@/lib/server/tenancy";
import { assertPropertyConditions, conditionLeaves, parseRoutineTrigger, RoutineTriggerError, type RoutineTrigger } from "@/lib/routine-triggers";

/** Every creation door and schema reevaluation uses the same scoped references. */
export async function validateRoutineTrigger(value: unknown, projectId: string, actorId: string): Promise<RoutineTrigger> {
  const trigger = parseRoutineTrigger(value);
  if (trigger.type === "schedule") return trigger;
  const service = getServiceClient();
  const invalid = () => { throw new RoutineTriggerError("invalidConditionReference"); };
  const people = new Set<string>();
  const categories = new Set<string>();
  if (trigger.type === "event") {
    if (trigger.assigneeId) people.add(trigger.assigneeId);
    if (trigger.issueId && !await issueInProject(service, trigger.issueId, projectId)) invalid();
  } else {
    const { data } = await service.from("pages").select("*").eq("id", trigger.databaseId).eq("project_id", projectId).eq("page_is_database", true).is("deleted_at", null).maybeSingle();
    if (!data) invalid();
    const page = await decodePage(data!, actorId);
    assertPropertyConditions(trigger, page.database_schema ?? []);
    for (const leaf of conditionLeaves(trigger.conditions)) {
      if (page.database_schema?.find(p => p.id === leaf.propertyId)?.type === "people" && typeof leaf.value === "string") people.add(leaf.value);
    }
  }
  for (const leaf of conditionLeaves(trigger.conditions)) {
    const target = leaf.field === "assignee" ? people : leaf.field === "category" ? categories : null;
    if (target) for (const id of Array.isArray(leaf.value) ? leaf.value : typeof leaf.value === "string" ? [leaf.value] : []) target.add(id);
  }
  for (const id of people) if (!await userCanBeAssigned(service, id, projectId)) invalid();
  for (const id of categories) {
    const { data } = await categoryStore(service, actorId).select("id").eq("id", id).eq("project_id", projectId);
    if (!data?.length) invalid();
  }
  return trigger;
}
