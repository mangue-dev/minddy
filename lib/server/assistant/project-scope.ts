import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeProjectName } from "@/lib/server/project-content";
import { locateIssueProject } from "@/lib/server/issue-reads";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AssistantProjectTargetResolver {
  userId: string;
  service: SupabaseClient;
}

/**
 * Resolve the `project_id` of a project-scoped tool call. A model may name
 * the project instead of passing its id — the user said "minddy (MIN)" and the
 * model relayed the key or the label. Accept a project key or exact name as
 * well, resolved against the projects the caller can access. A value matching
 * nothing falls through to the access check unchanged.
 */
export async function resolveAssistantProjectTarget(
  ctx: AssistantProjectTargetResolver,
  requestedProjectId: unknown,
): Promise<{ projectId: string | null }> {
  const explicit = typeof requestedProjectId === "string"
    ? requestedProjectId.trim()
    : "";
  const projectId = explicit || null;
  if (!projectId || UUID_RE.test(projectId)) {
    return { projectId };
  }

  // The caller named the project (key or label) rather than passing its id:
  // resolve it against the accessible projects instead of failing the lookup.
  // A lookup that cannot run (or fails) falls back to the raw value: the
  // access check downstream stays the single authority on what is reachable.
  try {
    const [{ data: owned, error: ownedError }, { data: memberships, error: membershipError }] =
      await Promise.all([
        ctx.service
          .from("projects")
          .select("id")
          .eq("owner_id", ctx.userId)
          .is("deleted_at", null),
        ctx.service.from("project_members").select("project_id").eq("user_id", ctx.userId),
      ]);
    if (ownedError || membershipError) return { projectId };
    const ids = new Set([
      ...((memberships ?? []) as Array<{ project_id: string }>).map((membership) => membership.project_id),
      ...((owned ?? []) as Array<{ id: string }>).map((project) => project.id),
    ]);
    if (ids.size === 0) return { projectId };
    const { data: visible, error } = await ctx.service
      .from("projects")
      .select("id, name, key, encrypted_content, encryption_version")
      .in("id", [...ids])
      .is("deleted_at", null);
    if (error) return { projectId };

    const needle = explicit.toLowerCase();
    const named = await Promise.all(((visible ?? []) as Array<{
      id: string; name: string | null; key: string; encrypted_content?: string | null;
      encryption_version?: number }>).map(async (project) => ({
        ...project, name: await decodeProjectName(project, ctx.userId),
      })));
    const matched = named.find(
      (project) =>
        project.key.toLowerCase() === needle || project.name.toLowerCase() === needle,
    );
    return { projectId: matched?.id ?? projectId };
  } catch {
    return { projectId };
  }
}

/**
 * A project tool call that names its issue but not its project (MIN-952): the
 * issue's own project fills `project_id`, the way the MCP reads it from the
 * reference. Only an `issue_id` UUID in a project the user can open counts;
 * any other call comes back unchanged, so the executor and the background
 * guard keep refusing a call with no project as before, and still check the
 * user's role in the filled project.
 */
export async function withIssueProject(
  ctx: AssistantProjectTargetResolver,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const named = typeof args.project_id === "string" && args.project_id.trim() !== "";
  const issueId = typeof args.issue_id === "string" ? args.issue_id.trim() : "";
  if (named || !UUID_RE.test(issueId)) return args;
  try {
    const located = await locateIssueProject(ctx.service, ctx.userId, issueId);
    return "projectId" in located ? { ...args, project_id: located.projectId } : args;
  } catch {
    return args;
  }
}
