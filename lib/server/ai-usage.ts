import "server-only";

import { randomUUID } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";

// Les FORMES vivent à part depuis MIN-224 (cf. `ai-usage-shape.ts`) : la boucle
// d'agent en a besoin dans la microVM, où ce module-ci — qui écrit en clé de
// service — n'a rien à faire. Ré-exportées ici pour que rien n'ait à changer
// d'import.
import {
  type AiFeature,
  type AiUsageBillTo,
} from "./ai-usage-shape";

export type {
  AiFeature,
  AiUsageBillTo,
  NormalizedUsage,
  OpenRouterUsage,
} from "./ai-usage-shape";
export { OPENROUTER_USAGE_INCLUDE, parseOpenRouterUsage } from "./ai-usage-shape";

/**
 * Suivi des coûts LLM — le point d'enregistrement UNIQUE de tous les appels IA.
 *
 * Chaque appel LLM écrit une ligne dans `ai_usage`. Les appels d'une même action
 * agentique partagent un `runId` (voir `newRunId`) → on peut agréger par appel,
 * par run et par type (`feature`). Le coût vient de l'usage rapporté par
 * OpenRouter quand on ajoute `usage: { include: true }` au corps de la requête.
 *
 * RÈGLE : `recordAiUsage` ne throw JAMAIS — le suivi de coût ne doit jamais faire
 * échouer la feature IA qui l'appelle (best-effort, à l'image de `insertStatEvents`).
 */

/** Un run_id frais : à générer une fois par action user (partagé par ses appels). */
export function newRunId(): string {
  return randomUUID();
}

/**
 * Ce qu'un run a dépensé, LU AU LEDGER (MIN-215) — toutes features confondues,
 * `sandbox_compute` comprise.
 *
 * À préférer à `agent_runs.cost_usd` partout où la réponse doit être vraie même
 * quand un chunk est mort : la colonne n'est écrite que par les chemins de sortie
 * sains de `executeAgentRun`, donc un chunk qui lève au milieu — ou dont
 * l'invocation est tuée à la limite de durée — n'y porte JAMAIS sa dépense. Les
 * lignes du ledger, elles, sont écrites appel par appel, avant l'accident.
 *
 * Rend `null` quand la lecture échoue, jamais 0 : un zéro se confondrait avec
 * « ce run n'a rien dépensé » et rechargerait le plafond qu'on cherche à tenir.
 * L'appelant retombe alors sur ce qu'il a — au pire le comportement d'avant.
 */
export async function spentFromLedger(runId: string): Promise<number | null> {
  try {
    const service = getServiceClient();
    // Somme faite EN BASE (`get_ai_run_spend`) : une lecture de lignes serait
    // plafonnée par PostgREST (1 000 par défaut) et rendrait, sur un run bavard,
    // une somme silencieusement basse.
    const { data, error } = await service.rpc("get_ai_run_spend", { p_run_id: runId });
    if (error) {
      console.error("[ai-usage] get_ai_run_spend failed:", error.message);
      return null;
    }
    const spent = Number(data ?? 0);
    return Number.isFinite(spent) ? spent : null;
  } catch (err) {
    console.error("[ai-usage] get_ai_run_spend threw:", (err as Error).message);
    return null;
  }
}

export interface AiUsageInput {
  runId: string;
  /** Index de l'appel dans le run (0 pour un appel unique). */
  seq?: number;
  feature: AiFeature;
  /** Qui paye, et à quel titre. Voir `AiUsageBillTo`. */
  billTo: AiUsageBillTo;
  model?: string | null;
  /** Défaut DB : 'openrouter'. Poser 'vercel' pour le compute sandbox. */
  provider?: string;
  /** Qui a payé l'appel LLM. Le quota utilisateur ne somme que `platform`. */
  keyMode?: "platform" | "byok";
  generationId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  /**
   * Prompt caching (MIN-242) : tokens RELUS au cache du fournisseur, et tokens
   * qu'il vient d'y écrire. `undefined`/`null` = le fournisseur n'en dit rien,
   * ce qui ne se lit pas comme un cache qui n'a pas mordu.
   */
  cachedTokens?: number | null;
  cacheWriteTokens?: number | null;
  cost?: number | null;
  /**
   * Le coût est CALCULÉ, pas rapporté par le fournisseur (MIN-216) — un essai de
   * stream abandonné (interruption, coupure, reprise) est facturé sans que
   * l'objet `usage` ne soit jamais arrivé. La ligne compte quand même : c'est le
   * seul moyen que la dépense entre dans les compteurs. Mais elle se distingue,
   * sinon l'admin finance comparerait sa marge à des dollars jamais relevés.
   */
  estimated?: boolean;
  projectId?: string | null;
  conversationId?: string | null;
}

/** Motif d'imputation écrit en base — 1:1 avec le check de la migration. */
type BilledReason = "trigger" | "project_owner" | "platform" | "unattributed";

function toRow(input: AiUsageInput) {
  return {
    run_id: input.runId,
    seq: input.seq ?? 0,
    feature: input.feature,
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.keyMode ? { key_mode: input.keyMode } : {}),
    model: input.model ?? null,
    generation_id: input.generationId ?? null,
    prompt_tokens: input.promptTokens ?? null,
    completion_tokens: input.completionTokens ?? null,
    total_tokens: input.totalTokens ?? null,
    // Omises quand le fournisseur n'en dit rien (MIN-242) : même précaution que
    // `estimated` juste en dessous — un déploiement qui précéderait sa migration
    // ne perdrait que le détail du cache, jamais la ligne.
    ...(input.cachedTokens != null ? { cached_tokens: input.cachedTokens } : {}),
    ...(input.cacheWriteTokens != null ? { cache_write_tokens: input.cacheWriteTokens } : {}),
    cost: input.cost ?? null,
    // Omise quand elle est fausse : la colonne a un défaut en base, et une ligne
    // ordinaire ne doit RIEN devoir à une migration. Si le code partait en prod
    // avant elle, seules les lignes estimées seraient refusées — pas le ledger
    // entier, ce qu'un champ toujours présent aurait provoqué.
    ...(input.estimated ? { estimated: true } : {}),
    user_id: null as string | null,
    billed_reason: "unattributed" as BilledReason,
    project_id: input.projectId ?? null,
    conversation_id: input.conversationId ?? null,
  };
}

/**
 * Imputation des jobs de fond (MIN-87) — cache court des owners de projet.
 *
 * Le budget d'usage est compté PAR USER (`get_user_usage_since` filtre sur
 * `user_id`) : une ligne sans `user_id` n'entre donc dans le compteur de
 * personne. Or les passes de fond (revue du feedback, smart-assign, embeddings
 * du board public) sont AUTORISÉES par le budget du owner du projet
 * (`ownerHasUsageBudget`) — les laisser hors compteur revenait à ouvrir une
 * consommation illimitée à côté de la porte qui la garde. D'où `projectOwner` :
 * ce que MIN-131 a retiré, c'est l'automatisme, pas le repli lui-même.
 */
const OWNER_CACHE_TTL_MS = 60_000;
const ownerCache = new Map<string, { ownerId: string | null; expiresAt: number }>();

async function resolveProjectOwners(projectIds: string[]): Promise<Map<string, string | null>> {
  const now = Date.now();
  const resolved = new Map<string, string | null>();
  const missing: string[] = [];
  for (const id of new Set(projectIds)) {
    const cached = ownerCache.get(id);
    if (cached && cached.expiresAt > now) resolved.set(id, cached.ownerId);
    else missing.push(id);
  }
  if (missing.length === 0) return resolved;

  const service = getServiceClient();
  const { data } = await service.from("projects").select("id, owner_id").in("id", missing);
  for (const row of (data ?? []) as { id: string; owner_id: string | null }[]) {
    resolved.set(row.id, row.owner_id);
    ownerCache.set(row.id, { ownerId: row.owner_id, expiresAt: now + OWNER_CACHE_TTL_MS });
  }
  // Projet introuvable : on mémorise l'absence pour ne pas re-interroger en boucle.
  for (const id of missing) {
    if (!resolved.has(id)) {
      resolved.set(id, null);
      ownerCache.set(id, { ownerId: null, expiresAt: now + OWNER_CACHE_TTL_MS });
    }
  }
  return resolved;
}

/**
 * Enregistre un (ou plusieurs) appel(s) IA dans le ledger `ai_usage`. Best-effort :
 * log l'erreur et l'avale — n'interrompt jamais l'appelant.
 *
 * L'imputation vient de `billTo` et de nulle part ailleurs (MIN-131) : un appel
 * avec déclencheur paye au déclencheur, un appel sans déclencheur nommable doit
 * demander le owner du projet, un appel offert à un visiteur sans compte
 * s'annonce `platform`, et tout ce qui n'entre dans aucun des trois s'écrit
 * `unattributed` — compté pour personne, mais journalisé en erreur.
 */
export async function recordAiUsage(
  input: AiUsageInput | AiUsageInput[]
): Promise<void> {
  const inputs = Array.isArray(input) ? input : [input];
  const rows = inputs.map(toRow);
  if (rows.length === 0) return;
  try {
    // Les owners des lignes qui les demandent, en une seule requête (cache court).
    const ownerRequests = inputs
      .map((i) => ("projectOwner" in i.billTo ? i.billTo.projectOwner : null))
      .filter((id): id is string => Boolean(id));
    const owners =
      ownerRequests.length > 0
        ? await resolveProjectOwners(ownerRequests)
        : new Map<string, string | null>();

    for (const [i, row] of rows.entries()) {
      const billTo = inputs[i].billTo;
      if ("userId" in billTo && billTo.userId) {
        row.user_id = billTo.userId;
        row.billed_reason = "trigger";
      } else if ("projectOwner" in billTo) {
        const ownerId = owners.get(billTo.projectOwner) ?? null;
        row.user_id = ownerId;
        row.billed_reason = ownerId ? "project_owner" : "unattributed";
        if (!ownerId) {
          // Le repli a été demandé mais n'a personne à qui aller : la dépense
          // sort de tous les compteurs. Ça se dit, sinon ça ne se voit jamais.
          console.error(
            `[ai-usage] ${row.feature}: owner introuvable pour le projet ${billTo.projectOwner} — ligne non imputée`
          );
        }
      } else if ("platform" in billTo) {
        // Dépense offerte, décidée : rien à imputer, et rien à signaler.
        row.billed_reason = "platform";
      } else {
        const reason =
          "unattributed" in billTo ? billTo.unattributed : "déclencheur annoncé mais vide";
        console.error(`[ai-usage] ${row.feature}: ligne non imputée — ${reason}`);
      }
    }

    const service = getServiceClient();
    const { error } = await service.from("ai_usage").insert(rows);
    if (error) console.error("[ai-usage] insert failed:", error.message);
  } catch (err) {
    console.error("[ai-usage] insert threw:", (err as Error).message);
  }
}
