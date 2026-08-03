import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { AgentLaunchIntent } from "@/lib/server/agent/launch";
import type { AgentRunVerdict } from "@/lib/server/agent/runs";

/**
 * La CHAÎNE (MIN-147) — l'objet durable sans lequel rien du reste n'est
 * possible : ni le point d'arrêt humain, ni le bouton « arrêter », ni le rapport
 * de fin. Elle porte l'étape courante, les règles déjà jouées, la dépense
 * cumulée (pour la DIRE, pas pour couper), le nombre de reprises et le motif
 * d'arrêt.
 *
 * Service client de bout en bout (aucune policy d'écriture sur `agent_chains`).
 *
 * Concurrence : l'avancement se fait par COMPARE-AND-SET sur `(id, step)`. Deux
 * crochets qui concluraient la même étape ne peuvent pas la jouer deux fois — le
 * perdant reçoit `null` et rend la main. Aucune fonction SQL nouvelle : le CAS
 * tient dans le `.eq("step", …)` de l'update.
 */

export type AgentChainStatus =
  /** EN SURSIS : ouverte, mais elle ne démarre qu'à `not_before` — et seulement
   *  si la condition qui l'a ouverte tient encore (cf. la migration). */
  | "pending"
  | "running"
  | "awaiting_human"
  | "stopped"
  | "completed"
  | "failed";

/** L'événement mis de côté par une chaîne en sursis, rejoué à son réveil. */
export interface PendingChainEvent {
  to: string;
  source: string;
}

export interface AgentChain {
  id: string;
  project_id: string;
  issue_id: string;
  owner_id: string;
  preset: string | null;
  status: AgentChainStatus;
  step: number;
  played_rule_ids: string[];
  retries: number;
  spent_usd: number;
  /** LEGACY : plus jamais posé. Une chaîne ne s'interrompt plus sur un plafond —
   *  seul le quota du compte borne la dépense (cf. l'en-tête de lib/automations).
   *  La colonne reste pour ne pas migrer une table pour un champ mort. */
  budget_usd: number | null;
  stop_reason: string | null;
  /** Heure d'amorçage d'une chaîne en sursis. Null = elle a déjà démarré. */
  not_before: string | null;
  /** L'événement qui l'a ouverte, à rejouer au réveil (chaîne en sursis). */
  pending_event: PendingChainEvent | null;
  created_at: string;
  updated_at: string;
}

/**
 * Statuts d'une chaîne VIVANTE — ceux que couvre l'index unique par ticket.
 * `pending` en fait partie : un ticket en sursis est OCCUPÉ, sans quoi une
 * deuxième chaîne s'ouvrirait dessus et les deux démarreraient.
 */
export const LIVE_CHAIN_STATUSES: AgentChainStatus[] = [
  "pending",
  "running",
  "awaiting_human",
];

/** Code Postgres d'une violation de contrainte d'unicité. */
const PG_UNIQUE_VIOLATION = "23505";

function toChain(row: unknown): AgentChain {
  const chain = row as AgentChain;
  return {
    ...chain,
    // `numeric` revient en string via PostgREST dès qu'il dépasse la précision
    // d'un double — on normalise ici, une fois, plutôt que chez chaque lecteur.
    spent_usd: Number(chain.spent_usd ?? 0),
    budget_usd: chain.budget_usd == null ? null : Number(chain.budget_usd),
    played_rule_ids: Array.isArray(chain.played_rule_ids) ? chain.played_rule_ids : [],
  };
}

/**
 * Ouvre une chaîne sur un ticket. `null` si une chaîne y est DÉJÀ vivante :
 * l'index partiel unique `idx_agent_chains_active_issue` tranche, et on traite
 * sa violation comme une réponse et non comme une panne — même doctrine
 * qu'`ActiveRunExistsError` pour les runs.
 */
export async function openChain(input: {
  projectId: string;
  issueId: string;
  ownerId: string;
  preset: string | null;
  /** Sursis : l'heure avant laquelle elle ne démarre pas. Absent = tout de suite. */
  notBefore?: string | null;
  /** L'événement à rejouer au réveil. Obligatoire avec `notBefore`. */
  pendingEvent?: PendingChainEvent | null;
}): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("agent_chains")
    .insert({
      project_id: input.projectId,
      issue_id: input.issueId,
      owner_id: input.ownerId,
      preset: input.preset,
      ...(input.notBefore
        ? {
            status: "pending",
            not_before: input.notBefore,
            pending_event: input.pendingEvent ?? null,
          }
        : {}),
    })
    .select("*")
    .single();
  if (error || !data) {
    if (error?.code === PG_UNIQUE_VIOLATION) return null;
    console.error("[automations] openChain failed:", error?.message);
    return null;
  }
  return toChain(data);
}

/** La chaîne VIVANTE d'un ticket, ou null. */
export async function chainForIssue(issueId: string): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .select("*")
    .eq("issue_id", issueId)
    .in("status", LIVE_CHAIN_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toChain(data) : null;
}

/** La DERNIÈRE chaîne d'un ticket, vivante ou non (lecture d'écran). */
export async function latestChainForIssue(issueId: string): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .select("*")
    .eq("issue_id", issueId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toChain(data) : null;
}

export async function getChain(chainId: string): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .select("*")
    .eq("id", chainId)
    .maybeSingle();
  return data ? toChain(data) : null;
}

/**
 * AVANCE la chaîne d'une étape en marquant la règle jouée — le compare-and-set
 * qui garantit qu'une étape ne se joue qu'une fois. `null` = un autre l'a jouée
 * (ou la chaîne n'est plus `running`) : l'appelant rend la main SANS rien lancer.
 */
export async function advanceChain(
  chain: AgentChain,
  ruleId: string,
): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .update({
      step: chain.step + 1,
      played_rule_ids: [...chain.played_rule_ids, ruleId],
      status: "running",
    })
    .eq("id", chain.id)
    .eq("step", chain.step)
    // PAS `LIVE_CHAIN_STATUSES` : une chaîne en SURSIS n'avance pas, elle se
    // réveille d'abord (`startPendingChain`), et ce réveil re-vérifie que la
    // condition qui l'a ouverte tient toujours. Avancer directement ferait sauter
    // ce contrôle — et l'update ci-dessus la passerait en `running` au passage.
    // NI `awaiting_human` : c'est le statut qui matérialise « la boucle attend
    // un humain », et le seul chemin légitime pour en sortir est `resumeChain`
    // (feu vert explicite). L'accepter ici ouvrait une seconde porte : un moteur
    // concurrent qui trouvait la chaîne entre `advanceChain` et `parkChain`
    // pouvait sauter le point d'arrêt EN SILENCE, après que le commentaire
    // « la suite attend ton feu vert » a été posté. Le moteur garantit de toute
    // façon `status === "running"` avant tout appel : ne rien perdre ici.
    .eq("status", "running")
    .select("*")
    .maybeSingle();
  return data ? toChain(data) : null;
}

/**
 * RECALCULE la dépense de la chaîne depuis ses runs. Idempotent par
 * construction — et c'est tout l'intérêt.
 *
 * L'ancienne version cumulait un delta (`spent += run.cost_usd`) en pariant sur
 * « exactement une fois par run ». Or `stampRun` garantit exactement une fois
 * par TRANSITION TERMINALE, et un run en traverse plusieurs par conception :
 * l'agent pose une question (repos), on lui répond (`/steer` le re-queue), il
 * repart, il se repose encore. Comme `agent_runs.cost_usd` est CUMULATIF, chaque
 * repos rajoutait le total du run depuis le début : un run à cinq tours de 0,10
 * affichait 1,50 pour 0,50 réellement dépensés.
 *
 * Une somme relue ne peut pas dériver, quel que soit le nombre d'appels.
 */
export async function recomputeChainSpend(chainId: string): Promise<number> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("cost_usd")
    .eq("chain_id", chainId);
  const total = ((data ?? []) as Array<{ cost_usd: number | string | null }>).reduce(
    (sum, row) => sum + (Number(row.cost_usd) || 0),
    0,
  );
  const next = Number(total.toFixed(6));
  await service.from("agent_chains").update({ spent_usd: next }).eq("id", chainId);
  return next;
}

/**
 * Réveille une chaîne EN SURSIS. Compare-and-set sur `pending` : le balayeur et
 * un « Lancer maintenant » simultanés ne peuvent pas la démarrer deux fois.
 */
export async function startPendingChain(chainId: string): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .update({ status: "running", not_before: null })
    .eq("id", chainId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  return data ? toChain(data) : null;
}

/**
 * Annule une chaîne en sursis. SILENCIEUX à dessein — ni commentaire, ni
 * notification : elle n'a rien joué, rien dépensé, et rien produit qui mérite
 * un rapport. Annoncer « la chaîne s'est arrêtée » pour un travail qui n'a
 * jamais commencé serait du bruit sur le ticket.
 */
export async function cancelPendingChain(
  chainId: string,
  reason: string,
): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .update({ status: "stopped", stop_reason: reason, not_before: null })
    .eq("id", chainId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  return data ? toChain(data) : null;
}

/**
 * Les chaînes en sursis DUES. Lues par le balayeur (cron) : c'est lui qui les
 * réveille, la fenêtre d'un `after()` ne survivant pas à cinq minutes d'attente.
 */
export async function duePendingChains(limit = 50): Promise<AgentChain[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .select("*")
    .eq("status", "pending")
    .lte("not_before", new Date().toISOString())
    .order("not_before", { ascending: true })
    .limit(limit);
  return ((data ?? []) as unknown[]).map(toChain);
}

/**
 * Chaînes `running` ABANDONNÉES : plus rien ne les porte.
 *
 * Le système n'avait aucun filet pour `running`. Une chaîne n'en sort que par le
 * crochet de fin de run — or ce crochet est une promesse en vol, qu'une fonction
 * qui gèle emporte ; et si un run manuel démarre dans l'intervalle, le moteur
 * rend la main et le run manuel, lui, ne porte pas de `chain_id` : plus aucun
 * événement ne viendra jamais. Comme `running` fait partie de l'index unique par
 * ticket, ce ticket n'acceptait alors PLUS JAMAIS d'automatisation.
 *
 * Le seuil est large à dessein (bien au-delà de la latence d'un crochet) : ce
 * balayage ne rattrape que ce qui est manifestement mort. Et le rattrapage est
 * sans risque — c'est le compare-and-set d'`advanceChain` qui décide au bout,
 * donc un événement simplement lent ne peut pas produire un double lancement.
 */
export async function staleRunningChains(
  staleBefore: string,
  limit = 25,
): Promise<AgentChain[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .select("*")
    .eq("status", "running")
    .lt("updated_at", staleBefore)
    .order("updated_at", { ascending: true })
    .limit(limit);
  return ((data ?? []) as unknown[]).map(toChain);
}

/** Gare la chaîne : elle attend un feu vert humain explicite. */
export async function parkChain(chainId: string): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .update({ status: "awaiting_human" })
    .eq("id", chainId)
    .eq("status", "running")
    .select("*")
    .maybeSingle();
  return data ? toChain(data) : null;
}

/** Feu vert humain : la chaîne repart. `null` si elle n'attendait pas. */
export async function resumeChain(chainId: string): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .update({ status: "running" })
    .eq("id", chainId)
    .eq("status", "awaiting_human")
    .select("*")
    .maybeSingle();
  return data ? toChain(data) : null;
}

/**
 * Arrête la chaîne. `reason` est un CODE (`quota`, `interrupted`,
 * `verification_failed`, `noRepo`, `run_failed`…), jamais une phrase : c'est le
 * commentaire de rapport qui le traduit, dans la langue du lecteur.
 */
export async function stopChain(
  chainId: string,
  reason: string,
): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .update({ status: "stopped", stop_reason: reason })
    .eq("id", chainId)
    .in("status", LIVE_CHAIN_STATUSES)
    .select("*")
    .maybeSingle();
  return data ? toChain(data) : null;
}

/** La chaîne est allée au bout de ses règles : plus rien à jouer. */
export async function completeChain(chainId: string): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .update({ status: "completed" })
    .eq("id", chainId)
    .in("status", LIVE_CHAIN_STATUSES)
    .select("*")
    .maybeSingle();
  return data ? toChain(data) : null;
}

/**
 * Reprise après une vérification d'implémentation en échec : on incrémente le
 * compteur de reprises et on DÉMARQUE les règles à rejouer (implémenter, puis
 * vérifier). Le plan, lui, reste écrit — ce n'est pas lui qu'on refait.
 */
export async function retryChain(
  chain: AgentChain,
  replayRuleIds: readonly string[],
): Promise<AgentChain | null> {
  const service = getServiceClient();
  const kept = chain.played_rule_ids.filter((id) => !replayRuleIds.includes(id));
  const { data } = await service
    .from("agent_chains")
    .update({ retries: chain.retries + 1, played_rule_ids: kept })
    .eq("id", chain.id)
    .eq("status", "running")
    .select("*")
    .maybeSingle();
  return data ? toChain(data) : null;
}

/**
 * Le dernier VERDICT rendu sur la chaîne (tool `report_verdict`). Deux lecteurs,
 * et c'est pour ça qu'il est ici plutôt que chez l'un d'eux : le moteur, qui
 * décide entre continuer, reprendre et rendre la main ; et le point d'arrêt
 * humain, dont le commentaire doit DIRE ce que la vérification a conclu — sans
 * quoi il annonce un plan « vérifié » sans le verdict de la vérification.
 */
export async function lastVerdictOfChain(chainId: string): Promise<AgentRunVerdict | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("verdict")
    .eq("chain_id", chainId)
    .not("verdict", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const verdict = (data as { verdict?: AgentRunVerdict | null } | null)?.verdict ?? null;
  return verdict && typeof verdict.ok === "boolean" ? verdict : null;
}

/** Le dernier run de la chaîne — ce qu'une reprise humaine doit rejouer. */
export async function lastRunOfChain(chainId: string): Promise<{
  id: string;
  intent: AgentLaunchIntent | null;
  status: string;
} | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("id, intent, status")
    .eq("chain_id", chainId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; intent: AgentLaunchIntent | null; status: string } | null) ?? null;
}
