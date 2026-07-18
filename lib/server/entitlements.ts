import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getResolvedBilling, type ResolvedBilling } from "@/lib/server/billing-accounts";
import { PlanLimitError } from "@/lib/server/plan-limit-error";
import { hasUsageBudget } from "@/lib/server/usage";

/**
 * Entitlements (MIN-72) — les gardes de plan appelées par les routes de
 * mutation. Les limites STRUCTURELLES (nb de projets, d'issues, membres,
 * agents) vivent ici ; le budget d'usage IA vit dans lib/server/usage.ts.
 *
 * Règle d'attribution : une limite structurelle se vérifie toujours sur le
 * plan du OWNER du projet (un membre Pro n'étend pas un projet d'un owner
 * Free) ; une action IA se paye sur le plan de son ACTEUR.
 */

export async function getEntitlements(userId: string): Promise<ResolvedBilling> {
  return getResolvedBilling(userId);
}

/** Nombre de projets (non supprimés) dont l'utilisateur est owner. */
export async function countOwnedProjects(ownerId: string): Promise<number> {
  const service = getServiceClient();
  const { count, error } = await service
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Garde de création de projet : throw 403 `project_limit_reached` si plein. */
export async function ensureProjectLimit(ownerId: string): Promise<void> {
  const { plan } = await getResolvedBilling(ownerId);
  if (plan.maxProjects == null) return;
  const owned = await countOwnedProjects(ownerId);
  if (owned >= plan.maxProjects) {
    throw new PlanLimitError("project_limit_reached", {
      limit: plan.maxProjects,
    });
  }
}

/**
 * Garde de création d'issue : la limite issues/projet du plan du OWNER du
 * projet. Appelée dans `createIssueForProject` → couvre tous les chemins
 * (UI, API v1, MCP, Numo, import CSV, dictée).
 */
export async function ensureIssueLimit(projectId: string): Promise<void> {
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
    .eq("project_id", projectId);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) >= plan.maxIssuesPerProject) {
    throw new PlanLimitError("issue_limit_reached", {
      limit: plan.maxIssuesPerProject,
    });
  }
}

/** Garde d'invitation de membres : réservé aux plans avec `allowMembers` (Pro). */
export async function ensureMembersAllowed(ownerId: string): Promise<void> {
  const { plan } = await getResolvedBilling(ownerId);
  if (!plan.allowMembers) {
    throw new PlanLimitError("members_pro_only");
  }
}

/** Garde de lancement d'agent : le plan doit inclure les agents (Go/Pro). */
export async function ensureAgentsAllowed(userId: string): Promise<void> {
  const { plan } = await getResolvedBilling(userId);
  if (!plan.allowAgents) {
    throw new PlanLimitError("agents_not_in_plan");
  }
}

/**
 * Billing gate de Smart Assign — branché sur le plan depuis MIN-72 : entitled
 * tant que le budget d'usage du owner n'est pas épuisé (l'action est payée par
 * le owner). Appelé à l'activation du toggle ET avant chaque run — un budget à
 * sec suspend l'exécution sans migration de données.
 */
export async function canUseSmartAssign(ownerId: string): Promise<boolean> {
  return hasUsageBudget(ownerId);
}
