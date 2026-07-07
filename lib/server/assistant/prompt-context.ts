import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { displayName } from "@/lib/display-name";
import { issueIdentifier } from "@/lib/issue-constants";
import type { PromptProjectContext } from "./prompt";

/**
 * Gather the project data injected into Numo's system prompt (status counts,
 * recent issues, members with display names, objectives, categories). Reads go
 * through the caller's RLS client; member hydration needs the service client
 * (auth admin). Used by the chat route and the @Numo comment agent.
 */
export async function gatherProjectPromptContext({
  supabase,
  service,
  project,
}: {
  supabase: SupabaseClient;
  service: SupabaseClient;
  project: { id: string; name: string; key: string; owner_id: string };
}): Promise<PromptProjectContext> {
  const [
    { data: statusRows },
    { data: recentIssues },
    { data: memberRows },
    { data: objectives },
    { data: categories },
  ] = await Promise.all([
    supabase.from("issues").select("status").eq("project_id", project.id),
    supabase
      .from("issues")
      .select("number, title, status")
      .eq("project_id", project.id)
      .order("updated_at", { ascending: false })
      .limit(5),
    service
      .from("project_members")
      .select("user_id")
      .eq("project_id", project.id),
    supabase
      .from("objectives")
      .select("id, name, status")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("categories")
      .select("id, name")
      .eq("project_id", project.id)
      .order("name", { ascending: true }),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const row of statusRows ?? []) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
  }

  const memberIds = [
    project.owner_id,
    ...(memberRows ?? []).map((m) => m.user_id as string),
  ];
  const users = await fetchAuthUsersById(service, memberIds);
  const members = memberIds.map((id) => ({
    user_id: id,
    name: displayName(toNamed(users.get(id)), "User"),
    role: (id === project.owner_id ? "owner" : "member") as "owner" | "member",
  }));

  return {
    id: project.id,
    name: project.name,
    key: project.key,
    statusCounts,
    recentIssues: (recentIssues ?? []).map((i) => ({
      identifier: issueIdentifier(project.key, i.number as number),
      title: i.title as string,
      status: i.status as string,
    })),
    members,
    objectives: (objectives ?? []) as PromptProjectContext["objectives"],
    categories: (categories ?? []) as PromptProjectContext["categories"],
  };
}
