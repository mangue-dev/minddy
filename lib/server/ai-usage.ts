import "server-only";

import { randomUUID } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";

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

/** Les types d'appels IA suivis (1:1 avec le check `feature` de la migration). */
export type AiFeature =
  | "numo_chat"
  | "numo_comment"
  | "dictation"
  | "transcription"
  | "smart_assign"
  | "feedback_classify"
  | "feedback_analyze"
  | "embedding"
  | "agent_code"
  | "sandbox_compute"
  | "web_search"
  | "pr_review"
  | "import_map"
  /**
   * Démo de dictée de la landing (MIN-150) : ses DEUX appels (transcription
   * puis rangement) s'écrivent sous cette seule feature, sous un run_id
   * commun. Une ligne = une démo jouée, son coût moyen par run = le prix d'un
   * passage. Les ranger sous 'transcription'/'dictation' les mélangeait à la
   * dictée des vrais comptes, et rendait les deux questions insolubles.
   */
  | "landing_demo";

/** Forme de l'objet `usage` renvoyé par OpenRouter (chat / embeddings / audio). */
export interface OpenRouterUsage {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  /** Coût USD — présent seulement si la requête a passé `usage: { include: true }`. */
  cost?: number | null;
  /** Endpoints audio (whisper) exposent parfois les tokens sous ces noms. */
  input_tokens?: number | null;
  output_tokens?: number | null;
}

/** Champs normalisés extraits d'un `usage` OpenRouter (tolérant aux absents). */
export interface NormalizedUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
}

/** À passer à chaque appel IA pour obtenir le coût inline dans la réponse. */
export const OPENROUTER_USAGE_INCLUDE = { include: true } as const;

/**
 * Normalise l'objet `usage` d'OpenRouter vers nos champs. Couvre les deux formes
 * de nommage des tokens (chat: prompt/completion, audio: input/output) et calcule
 * `totalTokens` par somme si l'API ne le fournit pas.
 */
export function parseOpenRouterUsage(
  usage: OpenRouterUsage | null | undefined
): NormalizedUsage {
  if (!usage) {
    return { promptTokens: null, completionTokens: null, totalTokens: null, cost: null };
  }
  const prompt = usage.prompt_tokens ?? usage.input_tokens ?? null;
  const completion = usage.completion_tokens ?? usage.output_tokens ?? null;
  const total =
    usage.total_tokens ??
    (prompt != null || completion != null ? (prompt ?? 0) + (completion ?? 0) : null);
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
    cost: usage.cost ?? null,
  };
}

/** Un run_id frais : à générer une fois par action user (partagé par ses appels). */
export function newRunId(): string {
  return randomUUID();
}

/**
 * À QUI la ligne est imputée (MIN-131) — dit par l'appelant, jamais deviné.
 *
 * La règle produit : chacun paye son propre usage, pas celui des autres membres
 * de son projet. Le repli sur le owner existe toujours, mais il se DEMANDE : un
 * chemin d'appel qui oublie l'utilisateur ne peut plus faire payer le owner en
 * silence, parce que `billTo` est obligatoire et que ces trois formes sont les
 * seules qui existent.
 */
export type AiUsageBillTo =
  /** Le déclencheur identifié paye. Le cas normal de toute action d'un user. */
  | { userId: string }
  /**
   * Aucun déclencheur nommable (visiteur anonyme du board public, passe de fond
   * du cron) : le owner du projet paye, parce que c'est SON budget qui a
   * autorisé l'appel (`ownerHasUsageBudget`). À réserver à ces cas-là.
   */
  | { projectOwner: string }
  /**
   * La PLATEFORME paye, délibérément : un appel qu'on offre à quelqu'un qui n'a
   * pas de compte (la démo de dictée de la landing, MIN-150). Comme
   * `unattributed`, la ligne n'entre dans le budget de personne — mais elle se
   * distingue en base, et ne se journalise PAS en erreur : c'est une dépense
   * décidée, pas une fuite. Le motif dit laquelle.
   */
  | { platform: string }
  /**
   * Personne ne paye — la ligne existe pour la compta, mais n'entre dans le
   * compteur d'aucun budget. Le motif est journalisé en erreur : c'est une
   * anomalie qu'on assume bruyamment, jamais un défaut tranquille.
   */
  | { unattributed: string };

/** Une ligne d'usage à enregistrer. `runId`, `feature` et `billTo` sont requis. */
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
  generationId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  cost?: number | null;
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
    model: input.model ?? null,
    generation_id: input.generationId ?? null,
    prompt_tokens: input.promptTokens ?? null,
    completion_tokens: input.completionTokens ?? null,
    total_tokens: input.totalTokens ?? null,
    cost: input.cost ?? null,
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
