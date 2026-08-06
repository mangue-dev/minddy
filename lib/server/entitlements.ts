import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getResolvedBilling, type ResolvedBilling } from "@/lib/server/billing-accounts";
import { PlanLimitError } from "@/lib/server/plan-limit-error";
import { hasUsageBudget } from "@/lib/server/usage";

/**
 * Entitlements (MIN-72) — les gardes de plan appelées par les routes de
 * mutation. Les limites STRUCTURELLES (nb de projets, d'issues, d'invités,
 * agents) vivent ici ; le budget d'usage IA vit dans lib/server/usage.ts.
 *
 * Règle d'attribution : une limite structurelle se vérifie toujours sur le
 * plan du OWNER du projet (un membre Pro n'étend pas un projet d'un owner
 * Free) ; une action IA se paye sur le plan de son ACTEUR.
 */

export async function getEntitlements(userId: string): Promise<ResolvedBilling> {
  return getResolvedBilling(userId);
}

/**
 * Nombre de projets (non supprimés) AUXQUELS l'utilisateur a accès : ceux dont
 * il est owner ∪ ceux où il est membre — le même périmètre que sa liste de
 * projets (RLS `projects_select`). Compter les seuls projets créés laisserait
 * un compte Free travailler sur autant de projets qu'il veut du moment qu'un
 * autre les a créés ; la limite porte sur ce qu'on voit, pas sur qui a cliqué.
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

  // `or()` dédoublonne d'office (union de lignes) : un owner qui aurait aussi
  // une ligne `project_members` ne serait pas compté deux fois.
  const { count, error } = await (memberIds.length > 0
    ? base.or(`owner_id.eq.${userId},id.in.(${memberIds.join(",")})`)
    : base.eq("owner_id", userId));
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Garde de création de projet : throw 403 `project_limit_reached` si plein. */
export async function ensureProjectLimit(ownerId: string): Promise<void> {
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
 * Garde d'invitation : le plafond d'invités PAR PROJET du plan du owner
 * (MIN-199). Le owner ne compte pas — il n'a pas de ligne `project_members` —,
 * donc « 2 invités » veut bien dire deux personnes en plus de soi.
 *
 * Une invitation encore EN ATTENTE occupe sa place : sans ça, on en envoie
 * cinquante d'un coup et le plafond ne veut plus rien dire.
 *
 * Vérifié à l'invitation, jamais rétroactivement : un projet qui dépasse déjà
 * son plafond (abonnement expiré, plan rétrogradé) garde tous ses membres,
 * seule la prochaine invitation est refusée. Aucune migration de données.
 */
export async function ensureMemberSlotAvailable(
  ownerId: string,
  projectId: string
): Promise<void> {
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
      // Une invitation PÉRIMÉE ne promet plus rien : elle ne peut plus être ni
      // rattachée ni acceptée (MIN-197). La compter mangerait une place du plan
      // pendant les soixante jours qui séparent l'expiration (30 j) de la purge
      // (`RETENTION_DAYS.pendingInvitations`, 90 j) — c'est le même piège que
      // MIN-133 avec la corbeille, sous une autre forme.
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

/**
 * Billing gate des automatisations de projet (MIN-147). Voisine de
 * `canUseSmartAssign`, mais PAS la même : Smart Assign ne regarde que le budget,
 * parce qu'un appel de routage tient dans n'importe quel plan. Une automatisation
 * lance des RUNS D'AGENT — elle doit donc aussi passer `allowAgents`, sans quoi
 * un compte Free armerait une boucle dont chaque étape se ferait refuser au
 * lancement.
 *
 * Renvoie un booléen : le throw, c'est `ensureAgentsAllowed`. Appelée à
 * l'activation du toggle ET avant chaque exécution — un budget à sec suspend les
 * chaînes sans migration de données.
 */
export async function canUseAutomations(ownerId: string): Promise<boolean> {
  const { plan } = await getResolvedBilling(ownerId);
  return plan.allowAgents && (await hasUsageBudget(ownerId));
}
