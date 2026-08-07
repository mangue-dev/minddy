import "server-only";

import { getAppConfigValue } from "@/lib/server/app-config";

/**
 * Le drapeau de la migration MIN-224 : ce projet fait-il tourner sa boucle
 * d'agent DANS la microVM, ou dans la fonction Vercel comme avant ?
 *
 * PAR PROJET, ET PAS PAR RUN (cf. docs/orchestrateur-process-long.md §6). Par
 * run, on ne saurait pas répondre à « pourquoi cette session s'est-elle
 * comportée autrement que l'autre ? ». Par projet, on bascule un dépôt à la fois
 * — en commençant par celui de minddy, où l'on voit tout.
 *
 * FIGÉ AU LANCEMENT, et c'est le point qui coûte s'il manque. Le drapeau est lu
 * une fois puis écrit sur la ligne du run (`agent_runs.loop_in_vm`), comme
 * `model` et `reasoning_level` le sont déjà. Sans ce gel, un tour lancé avant la
 * bascule et repris après repartirait sur une boucle qui n'a jamais vu son
 * checkpoint — et l'inverse au retour arrière.
 *
 * Même mécanisme que `agent_subagent_max_parallel`
 * ([subagent-config.ts](subagent-config.ts)) : une clé `app_config`, un cache de
 * 60 s dans chaque worker, et un repli qui ne casse rien — une valeur illisible
 * laisse simplement le projet sur l'ancienne forme, celle qui tourne depuis un an.
 */

/** Clé `app_config` : JSON, tableau d'ids de projets (ou `"*"` pour tous). */
export const LOOP_IN_VM_CONFIG_KEY = "agent_loop_in_vm_projects";

/**
 * Les projets basculés, tels que la config les déclare. `"*"` bascule tout — il
 * n'est là que pour le jour où il ne restera plus qu'à retirer le drapeau, et
 * pour un preview où l'on veut exercer la nouvelle forme sans lister d'id.
 */
function parseProjects(raw: string | null): string[] | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const ids = parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    return ids.length > 0 ? ids.map((id) => id.trim()) : null;
  } catch {
    return null;
  }
}

/**
 * Ce projet lance-t-il ses runs avec la boucle dans la microVM ? Lu UNE fois, au
 * lancement — jamais en cours de run.
 *
 * Ne lève jamais : une config absente, illisible ou une base injoignable rendent
 * `false`. Un drapeau de migration qui manque doit laisser tourner l'ancienne
 * forme, pas empêcher un lancement.
 */
export async function loopInVmForProject(projectId: string): Promise<boolean> {
  const raw = await getAppConfigValue(LOOP_IN_VM_CONFIG_KEY).catch(() => null);
  const projects = parseProjects(raw);
  if (!projects) return false;
  return projects.includes("*") || projects.includes(projectId);
}
