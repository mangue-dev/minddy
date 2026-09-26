import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveAssistantProjectId(
  contextProjectId: string | null,
  requestedProjectId: unknown,
): string | null {
  if (typeof requestedProjectId !== "string") return contextProjectId;
  const explicitProjectId = requestedProjectId.trim();
  return explicitProjectId || contextProjectId;
}

export interface AssistantProjectTargetResolver {
  userId: string;
  service: SupabaseClient;
}

/**
 * Resolve the project target of a project-scoped tool call. A model may name
 * the project instead of passing its id — the user said "minddy (MIN)" and the
 * model relayed the key or the label. Accept a project key or exact name as
 * well, resolved against the projects the caller can access. A real UUID and
 * an implicit conversation context keep behaving exactly as before, and a
 * value matching nothing falls through to the access check unchanged.
 */
export async function resolveAssistantProjectTarget(
  ctx: AssistantProjectTargetResolver,
  contextProjectId: string | null,
  requestedProjectId: unknown,
): Promise<{ projectId: string | null; error?: string }> {
  const projectId = resolveAssistantProjectId(contextProjectId, requestedProjectId);
  const explicit = typeof requestedProjectId === "string"
    ? requestedProjectId.trim()
    : "";
  if (!explicit || UUID_RE.test(projectId ?? "")) {
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
          .select("id, name, key")
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
      .select("id, name, key")
      .in("id", [...ids])
      .is("deleted_at", null);
    if (error) return { projectId };

    const needle = explicit.toLowerCase();
    const matched = ((visible ?? []) as Array<{ id: string; name: string; key: string }>).find(
      (project) =>
        project.key.toLowerCase() === needle || project.name.toLowerCase() === needle,
    );
    return { projectId: matched?.id ?? projectId };
  } catch {
    return { projectId };
  }
}
