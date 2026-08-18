import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";

/**
 * The bridge between a FORGE account and a member of the minddy project: “octocat”
 * → the user who connected this account.
 *
 * This is what was missing from the issue sync (MIN-97). She let everything
 * arrive unassigned, with a reason that held at the time — "the assigned
 * GitHub is a forge account, not a project member." Except that since
 * MIN-144 minddy knows exactly who is who: `git_user_identities` carries the
 * GitHub login of each user, and on the GitLab side it is the OAuth connection
 * which IS the identity (same share as `forge-actor.ts`).
 *
 * Two guardrails, and they are the subject of the module:
 *
 * 1. **Only MEMBERS of the project** enter the index. A GitHub login
 * known to minddy but foreign to this project should not be seen there
 * assign tickets: `issues.assignee_id` carries an FK to auth.users,
 * it would pass, and the ticket would land with someone who doesn't even see
 * not the project.
 * 2. **Nothing is guessed.** A login without a connected account looks like
 * no one — there is no matching by name here, unlike
 * CSV import (`lib/import/people.ts`), which only has names to match. put
 * in your tooth. Here we have an exact equality, and a bad assignee costs
 * more expensive than no assignee.
 */

/** forge login (lowercase) → `user_id` minddy. */
export type ForgeAssigneeIndex = Map<string, string>;

/** The members of the project: the owner (who does not have a line
 * `project_members`) and the members, like everywhere else. */
async function loadProjectUserIds(projectId: string): Promise<string[]> {
  const service = getServiceClient();
  const [{ data: project }, { data: members }] = await Promise.all([
    service.from("projects").select("owner_id").eq("id", projectId).maybeSingle(),
    service.from("project_members").select("user_id").eq("project_id", projectId),
  ]);
  return [
    ...new Set([
      ...(project?.owner_id ? [project.owner_id as string] : []),
      ...(members ?? []).map((m) => m.user_id as string),
    ]),
  ];
}

/**
 * Index login → member for this project and this forge. Empty (never `null`) if
 * no one has connected their account: the caller then assigns nothing, which
 * is the behavior before.
 */
export async function buildForgeAssigneeIndex(params: {
  projectId: string;
  provider: RepoProviderId;
}): Promise<ForgeAssigneeIndex> {
  const index: ForgeAssigneeIndex = new Map();
  const userIds = await loadProjectUserIds(params.projectId);
  if (userIds.length === 0) return index;

  const service = getServiceClient();
  // GitHub: MIN-144’s personal account. GitLab: the OAuth connection, which
  // already carries the person's login — duplicating it would cause the two to diverge
  // token rotations (same reason as `listUserIdentities`).
  const table =
    params.provider === "github" ? "git_user_identities" : "git_connections";
  const { data, error } = await service
    .from(table)
    .select("user_id, account_login")
    .eq("provider", params.provider)
    .in("user_id", userIds);
  if (error) {
    console.error("[forge-members] identity lookup failed:", error.message);
    return index;
  }

  for (const row of data ?? []) {
    const login = (row.account_login as string | null)?.trim().toLowerCase();
    // First come, first served: two minddy accounts that would have managed to
    // declare the SAME forge login are ambiguous, and the second should not
    // steal the tickets from the first one.
    if (login && !index.has(login)) index.set(login, row.user_id as string);
  }
  return index;
}

/** The member that this login designates, or `null`. */
export function matchForgeAssignee(
  logins: string[],
  index: ForgeAssigneeIndex,
): string | null {
  // The two forges accept SEVERAL assignees, minddy only one: we take the
  // first that we recognize, in the order rendered by the forge (that of
  // the assignment). The others are not lost - they remain
  // readable on the remote issue, the link of which is in the ticket resource.
  for (const login of logins) {
    const found = index.get(login.trim().toLowerCase());
    if (found) return found;
  }
  return null;
}
