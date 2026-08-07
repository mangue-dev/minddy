import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";

/**
 * Le pont entre un compte de FORGE et un membre du projet minddy : « octocat »
 * → l'utilisateur qui a connecté ce compte-là.
 *
 * C'est ce qui manquait à la synchro d'issues (MIN-97). Elle laissait tout
 * arriver non assigné, avec une raison qui tenait à l'époque — « l'assigné
 * GitHub est un compte de la forge, pas un membre du projet ». Sauf que depuis
 * MIN-144 minddy sait exactement qui est qui : `git_user_identities` porte le
 * login GitHub de chaque utilisateur, et côté GitLab c'est la connexion OAuth
 * qui EST l'identité (même partage que `forge-actor.ts`).
 *
 * Deux garde-fous, et ils sont le sujet du module :
 *
 *  1. **Seuls les MEMBRES du projet** entrent dans l'index. Un login GitHub
 *     connu de minddy mais étranger à ce projet-ci ne doit pas s'y voir
 *     assigner des tickets : `issues.assignee_id` porte une FK vers auth.users,
 *     elle passerait, et le ticket atterrirait chez quelqu'un qui ne voit même
 *     pas le projet.
 *  2. **Rien n'est deviné.** Un login sans compte connecté ne ressemble à
 *     personne — il n'y a pas de rapprochement par nom ici, contrairement à
 *     l'import CSV (`lib/import/people.ts`), qui n'a que des noms à se mettre
 *     sous la dent. Ici on a une égalité exacte, et un mauvais assigné coûte
 *     plus cher qu'une absence d'assigné.
 */

/** login de la forge (minuscules) → `user_id` minddy. */
export type ForgeAssigneeIndex = Map<string, string>;

/** Les membres du projet : le propriétaire (qui n'a pas de ligne
 *  `project_members`) et les membres, comme partout ailleurs. */
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
 * Index login → membre pour ce projet et cette forge. Vide (jamais `null`) si
 * personne n'a connecté son compte : l'appelant n'assigne alors rien, ce qui
 * est le comportement d'avant.
 */
export async function buildForgeAssigneeIndex(params: {
  projectId: string;
  provider: RepoProviderId;
}): Promise<ForgeAssigneeIndex> {
  const index: ForgeAssigneeIndex = new Map();
  const userIds = await loadProjectUserIds(params.projectId);
  if (userIds.length === 0) return index;

  const service = getServiceClient();
  // GitHub : le compte personnel de MIN-144. GitLab : la connexion OAuth, qui
  // porte déjà le login de la personne — la dupliquer ferait diverger deux
  // rotations de token (même raison que `listUserIdentities`).
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
    // Premier arrivé, premier servi : deux comptes minddy qui auraient réussi à
    // déclarer le MÊME login de forge sont ambigus, et le second ne doit pas
    // voler les tickets du premier.
    if (login && !index.has(login)) index.set(login, row.user_id as string);
  }
  return index;
}

/** Le membre que ce login désigne, ou `null`. */
export function matchForgeAssignee(
  logins: string[],
  index: ForgeAssigneeIndex,
): string | null {
  // Les deux forges acceptent PLUSIEURS assignés, minddy un seul : on prend le
  // premier qu'on reconnaisse, dans l'ordre rendu par la forge (celui de
  // l'assignation). Les autres ne sont pas perdus pour autant — ils restent
  // lisibles sur l'issue distante, dont le lien est en ressource du ticket.
  for (const login of logins) {
    const found = index.get(login.trim().toLowerCase());
    if (found) return found;
  }
  return null;
}
