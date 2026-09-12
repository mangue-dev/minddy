import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssistantMention,
  AssistantPageContext,
  AssistantPinnedContext,
} from "@/lib/assistant-types";

/** Resolve resource provenance through the requesting user's RLS on every send. */
export async function validateMessageContext(
  supabase: SupabaseClient,
  context: AssistantPageContext | null,
  mentions: AssistantMention[],
): Promise<{ context: AssistantPageContext | null; mentions: AssistantMention[] } | null> {
  const projects = new Map<string, Promise<boolean>>();
  const visibleProject = (id: string) => {
    if (!projects.has(id)) {
      projects.set(id, (async () => {
        const { data } = await supabase.from("projects").select("id")
          .eq("id", id).is("deleted_at", null).maybeSingle();
        return !!data;
      })());
    }
    return projects.get(id)!;
  };
  const bind = async <T extends AssistantMention | AssistantPinnedContext>(
    item: T,
  ): Promise<(T & { projectId?: string }) | null> => {
    const kind = "kind" in item ? item.kind : item.type;
    if (kind === "member") return item;
    if (kind === "project") {
      return await visibleProject(item.id) ? { ...item, projectId: item.id } : null;
    }
    const table = { issue: "issues", objective: "objectives", page: "pages" }[kind];
    const { data } = await supabase.from(table).select("id, project_id")
      .eq("id", item.id).is("deleted_at", null).maybeSingle();
    if (!data || !(await visibleProject(data.project_id))) return null;
    return { ...item, projectId: data.project_id };
  };
  const next = context ? { ...context } : null;
  if (next?.projectId && !(await visibleProject(next.projectId))) return null;
  for (const [field, kind] of [
    ["issueId", "issue"],
    ["objectiveId", "objective"],
    ["pageId", "page"],
  ] as const) {
    const id = next?.[field];
    if (!next || !id) continue;
    const item = await bind({ kind, id, label: id });
    if (!item || (next.projectId && next.projectId !== item.projectId)) return null;
    // Resource identity determines its project, even when the project chip was hidden.
    next.projectId = item.projectId;
  }
  if (next?.issueIds) {
    const issues = await Promise.all(
      next.issueIds.map((id) => bind({ kind: "issue", id, label: id })),
    );
    if (issues.some((item) => !item || (next.projectId && next.projectId !== item.projectId))) {
      return null;
    }
    next.issueProjectIds = issues.map((item) => item!.projectId!);
  }
  for (const [field, table, softDeleted] of [
    ["feedbackId", "feedback_posts", true],
    ["routineId", "agent_routines", true],
    ["viewId", "views", false],
  ] as const) {
    const id = next?.[field];
    if (!next || !id) continue;
    let query = supabase.from(table).select("id, project_id").eq("id", id);
    if (softDeleted) query = query.is("deleted_at", null);
    const { data } = await query.maybeSingle();
    if (!data || (next.projectId && next.projectId !== data.project_id)) return null;
    if (data.project_id) {
      if (!(await visibleProject(data.project_id))) return null;
      next.projectId = data.project_id;
    }
  }
  if (next?.cycleId) {
    const { data } = await supabase.from("cycles").select("id").eq("id", next.cycleId).maybeSingle();
    if (!data) return null;
  }
  if (next?.pinned) {
    const pinned = await Promise.all(next.pinned.map(bind));
    if (pinned.some((item) => !item)) return null;
    next.pinned = pinned as AssistantPinnedContext[];
  }
  const boundMentions = await Promise.all(mentions.map(bind));
  if (boundMentions.some((item) => !item)) return null;
  return { context: next, mentions: boundMentions as AssistantMention[] };
}
