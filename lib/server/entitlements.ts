import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getResolvedBilling, type ResolvedBilling } from "@/lib/server/billing-accounts";
import { PlanLimitError } from "@/lib/server/plan-limit-error";
import { hasUsageBudget } from "@/lib/server/usage";
import { isManagedBillingEnabled } from "@/lib/managed-services";

/**
 * Entitlements (MIN-72) — plane guards called by
 * mutation routes. STRUCTURAL limits (number of projects, issues, guests,
 * agents) live here; the IA usage budget lives in lib/server/usage.ts.
 *
 * Assignment rule: a structural limit is always verified on the
 * plan of the OWNER of the project (a Pro member does not extend a project of an owner
 * Free); an AI action is paid for on the level of its ACTOR.
 */

export async function getEntitlements(userId: string): Promise<ResolvedBilling> {
  return getResolvedBilling(userId);
}

/**
 * Number of projects (not deleted) TO WHICH the user has access: those of which
 * he is owner ∪ those where he is a member — the same scope as his list of
 * projects (RLS `projects_select`). Counting only the projects created would leave
 * a Free account working on as many projects as it wants as long as another
 * created them; the limit is on what you see, not who clicked.
 */
export async function countAccessibleProjects(userId: string): Promise<number> {
  const service = getServiceClient();

  const { data: memberships, error: membershipError } = await service
    .from("project_members")
    .select("project_id")
    .eq("user_id", userId);
  if (membershipError) throw new Error(membershipError.message);

  const memberIds = [
    ...new Set((memberships ?? []).map((m) => m.project_id as string)),
  ];

  const base = service
    .from("projects")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);

  // `or()` automatically deduplicates (union of lines): an owner who would also have
  // a `project_members` line would not be counted twice.
  const { count, error } = await (memberIds.length > 0
    ? base.or(`owner_id.eq.${userId},id.in.(${memberIds.join(",")})`)
    : base.eq("owner_id", userId));
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Project creation guard: throw 403 `project_limit_reached` if full. */
export async function ensureProjectLimit(ownerId: string): Promise<void> {
  if (!isManagedBillingEnabled()) return;
  const { plan } = await getResolvedBilling(ownerId);
  if (plan.maxProjects == null) return;
  const accessible = await countAccessibleProjects(ownerId);
  if (accessible >= plan.maxProjects) {
    throw new PlanLimitError("project_limit_reached", {
      limit: plan.maxProjects,
    });
  }
}

/**
 * Issue creation guard: the issues/project limit of the OWNER plan of the
 * project. Called in `createIssueForProject` → covers all paths
 * (UI, API v1, MCP, Numo, CSV import, dictation).
 */
export async function ensureIssueLimit(projectId: string): Promise<void> {
  if (!isManagedBillingEnabled()) return;
  const service = getServiceClient();
  const { data: project, error } = await service
    .from("projects")
    .select("owner_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!project?.owner_id) return;

  const { plan } = await getResolvedBilling(project.owner_id);
  if (plan.maxIssuesPerProject == null) return;

  const { count, error: countError } = await service
    .from("issues")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("project_id", projectId);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) >= plan.maxIssuesPerProject) {
    throw new PlanLimitError("issue_limit_reached", {
      limit: plan.maxIssuesPerProject,
    });
  }
}

/**
 * Invitation guard: the guest cap PER DRAFT of the owner's plan
 * (MIN-199). The owner does not count — he has no line `project_members` —,
 * so “2 guests” means two people in addition to yourself.
 *
 * An invitation still PENDING occupies its place: without that, we send
 * fifty at once and the ceiling no longer wants anything say.
 *
 * Checked at the invitation, never retroactively: a project which already exceeds
 * its ceiling (expired subscription, downgraded plan) keeps all its members,
 * only the next invitation is refused. No data migration.
 */
export async function ensureMemberSlotAvailable(
  ownerId: string,
  projectId: string
): Promise<void> {
  if (!isManagedBillingEnabled()) return;
  const { plan } = await getResolvedBilling(ownerId);
  if (plan.maxMembersPerProject == null) return;

  const service = getServiceClient();
  const [members, invitations] = await Promise.all([
    service
      .from("project_members")
      .select("user_id", { count: "exact", head: true })
      .eq("project_id", projectId),
    service
      .from("project_invitations")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("status", "pending")
      // An EXPOSURE invitation no longer promises anything: it can no longer be
      // attached nor accepted (MIN-197). Counting it would eat up a place in the plan
      // during the sixty days which separate the expiration (30 days) of the purge
      // (`RETENTION_DAYS.pendingInvitations`, 90 days) — this is the same trap as
      // MIN-133 with the trash can, in another form.
      .gt("expires_at", new Date().toISOString()),
  ]);
  if (members.error) throw new Error(members.error.message);
  if (invitations.error) throw new Error(invitations.error.message);

  const used = (members.count ?? 0) + (invitations.count ?? 0);
  if (used >= plan.maxMembersPerProject) {
    throw new PlanLimitError("member_limit_reached", {
      limit: plan.maxMembersPerProject,
    });
  }
}

/** Agent Launch Guard: The plan must include agents (Go/Pro). */
export async function ensureAgentsAllowed(userId: string): Promise<void> {
  if (!isManagedBillingEnabled()) return;
  const { plan } = await getResolvedBilling(userId);
  if (!plan.allowAgents) {
    throw new PlanLimitError("agents_not_in_plan");
  }
}

/**
 * Smart Assign billing gate — connected to the plan from MIN-72: entitled
 * as long as the owner's usage budget is not exhausted (the action is paid by
 * the owner). Called on activation of the AND toggle before each run — a budget at
 * sec suspends execution without data migration.
 */
export async function canUseSmartAssign(ownerId: string): Promise<boolean> {
  return hasUsageBudget(ownerId);
}

/**
 * Billing gate of project automations (MIN-147). Neighbor of
 * `canUseSmartAssign`, but NOT the same: Smart Assign only looks at the budget,
 * because a routing call fits in any plan. An automation
 * launches AGENT RUNS — it must therefore also pass `allowAgents`, otherwise
 * a Free account would arm a loop whose each step would be refused at
 * launch.
 *
 * Returns a boolean: the throw is `ensureAgentsAllowed`. Called to
 * activate the AND toggle before each execution — a dry budget suspends
 * chains without data migration.
 */
export async function canUseAutomations(ownerId: string): Promise<boolean> {
  if (!isManagedBillingEnabled()) return true;
  const { plan } = await getResolvedBilling(ownerId);
  return plan.allowAgents && (await hasUsageBudget(ownerId));
}
