/**
 * LES FORMES de la comptabilité d'usage IA — les types, la normalisation de
 * l'`usage` d'OpenRouter, et rien d'autre.
 *
 * SÉPARÉ D'`ai-usage.ts` PAR MIN-224, et pour une seule raison. La boucle
 * d'agent a besoin de ces formes-là ; elle n'a rien à faire de l'ÉCRITURE, qui
 * passe par le client Supabase en clé de service. Or depuis MIN-224 la boucle
 * descend dans la microVM, où le modèle exécute du shell arbitraire : un `env`
 * y suffirait à lire `SUPABASE_SERVICE_ROLE_KEY` si ce module-là entrait dans
 * son bundle. Le graphe d'imports du bundle est gardé par
 * `vm-bundle-secrets.test.ts` — c'est cette arête-ci qu'il pointait du doigt
 * depuis MIN-216, sous le nom de « dette écrite ».
 *
 * Rien ici ne touche à la base, ne lit d'environnement, ni n'importe de SDK :
 * c'est de l'arithmétique et des noms. `ai-usage.ts` les ré-exporte, donc aucun
 * appelant existant ne change.
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
   * Découpe d'un brief en objectifs + tickets (MIN-172) : un appel par brief
   * collé. Sa propre feature, comme `import_map` : c'est le coût de l'amorce
   * d'un projet, et on veut pouvoir le lire seul.
   */
  | "brief_split"
  /**
   * Démo de dictée de la landing (MIN-150) : ses DEUX appels (transcription
   * puis rangement) s'écrivent sous cette seule feature, sous un run_id
   * commun. Une ligne = une démo jouée, son coût moyen par run = le prix d'un
   * passage. Les ranger sous 'transcription'/'dictation' les mélangeait à la
   * dictée des vrais comptes, et rendait les deux questions insolubles.
   */
  | "landing_demo"
  /**
   * Dicter un retour — au board public comme dans le dashboard. Ses DEUX appels
   * (l'écoute puis le rangement par Numo) s'écrivent sous cette seule feature,
   * sous un run_id commun : une ligne = une prise, son coût moyen par run = le
   * prix d'un retour dicté. Côté utilisateur elle rejoint le segment
   * « Retours » (`USAGE_SEGMENTS`) : c'est du feedback, pas de la dictée de
   * ticket, et c'est dans cette ligne-là qu'on ira chercher sa dépense.
   */
  | "feedback_voice"
  /**
   * Un run de ROUTINE (MIN-185). Techniquement c'est le run de `agent_code`, au
   * mot près — mêmes appels, même sandbox. En facturation, non : un run d'agent
   * est un geste qu'on a fait, une routine est un abonnement qu'on a laissé
   * tourner, et les confondre rend « qu'est-ce qui a mangé mon budget ce
   * mois-ci ? » insoluble quand la réponse est « quelque chose qui tourne tout
   * seul ». D'où DEUX features, une par nature de coût — sans
   * `routine_compute`, les minutes de microVM d'une routine resteraient sous
   * « Agents ». Les sous-agents d'un run de routine se facturent avec leur mère.
   */
  | "routine_code"
  | "routine_compute";

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
