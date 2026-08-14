import type { ModelPricing } from "@/lib/model-multiplier";

/**
 * CE QUE LA MICROVM DIT AVOIR DÉPENSÉ, ramené à ce qui est possible (MIN-329).
 *
 * `POST /api/agent-vm/usage` est le SEUL registre du budget : la ligne qu'il
 * écrit est ce qui compte dans le quota mensuel du compte et dans le plafond du
 * run. Or le corps de cette requête vient d'une boucle pilotée par un modèle qui
 * lit du contenu tiers — issues, diffs, pages web. Une injection suffisait à y
 * poster un `cost` négatif : la somme du mois DESCENDAIT, et le plafond de
 * dépense sautait pour tout le compte. Le même chemin, dans l'autre sens,
 * imputait une dépense fictive au propriétaire du run.
 *
 * La défense tient en deux temps, et le second est le vrai :
 *
 * 1. **Des bornes** — un montant est un nombre fini, positif ou nul, sous un
 *    plafond par ligne ; un compte de tokens ne peut être ni négatif ni délirant.
 *    Hors bornes, la ligne est REFUSÉE (rien n'est écrit) et ça se trace.
 * 2. **Un plafond CALCULÉ** — les tokens rapportés au tarif publié du modèle
 *    donnent ce que cet appel peut coûter au maximum. Au-dessus, on n'écrit pas
 *    le chiffre de la VM mais le nôtre, marqué `estimated`. C'est ce qui fait que
 *    le montant n'est plus une déclaration : le seul levier qui reste à une VM
 *    est de mentir sur ses tokens, et ceux-là sont bornés aussi.
 *
 * Pourquoi PLAFONNER plutôt que remplacer systématiquement : le coût rapporté par
 * le fournisseur est la vraie facture (remises de cache, tarifs négociés, BYOK),
 * notre calcul n'en est qu'un majorant au prix affiché. Le remplacer partout
 * ferait payer le cache au prix plein à tout le monde pour se protéger d'un cas
 * qui ne s'est jamais produit. On garde donc la valeur rapportée TANT qU'ELLE EST
 * PLAUSIBLE, et on la coupe dès qu'elle ne l'est plus.
 *
 * Module PUR — pas d'IO, pas de `server-only` : c'est ce qui le rend testable
 * ligne à ligne, et c'est là que vivent les invariants qu'un test doit casser.
 */

/** Aucun appel unique ne rapporte plus de tokens que ça. Un ordre de grandeur
 *  au-dessus des plus grandes fenêtres de contexte publiées. */
export const MAX_USAGE_TOKENS = 10_000_000;

/** Plafond DUR d'une ligne, tarif inconnu compris : un appel LLM au tarif le plus
 *  cher du marché, avec la plus grande fenêtre, reste très en dessous. */
export const MAX_USAGE_COST_USD = 100;

/** La marge qu'on laisse au chiffre du fournisseur au-dessus de notre calcul.
 *  Elle absorbe ce que le prix affiché ne dit pas : majoration de routage,
 *  tokens de raisonnement facturés à part, arrondis. */
export const USAGE_COST_TOLERANCE = 2;

/** En dessous de ce montant, on ne plafonne pas : sur une ligne à quelques
 *  millièmes de dollar, la tolérance relative ne mesure plus rien. */
export const USAGE_COST_FLOOR_USD = 0.05;

/** Ce que l'index OpenRouter sait du prix d'un modèle. */
export interface UsageModelPricing {
  pricing: ModelPricing | null;
  cachePricing: { readUsdPerMTok: number; writeUsdPerMTok: number } | null;
}

/** Les compteurs d'une ligne, une fois vérifiés. */
export interface UsageTokens {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cachedTokens: number | null;
  cacheWriteTokens: number | null;
}

export type UsageClaimVerdict =
  | { ok: false; reason: string }
  | (UsageTokens & {
      ok: true;
      cost: number | null;
      estimated: boolean;
      /** Le montant rapporté, quand il a été remplacé par le nôtre. */
      clampedFrom?: number;
    });

/** `ai_usage.cost` est un `numeric(12,6)` : on arrondit là où la colonne coupe. */
function roundUsd(usd: number): number {
  return Math.round(usd * 1e6) / 1e6;
}

/**
 * Un compteur de tokens, ou `null` quand il n'est pas annoncé. `undefined` dit
 * « refusé » — un compteur PRÉSENT mais impossible n'est pas une absence : le
 * traiter comme telle laisserait passer la ligne avec un compteur en moins, donc
 * un plafond calculé plus bas, donc rien de gagné.
 */
function tokenField(raw: unknown): number | null | undefined {
  if (raw == null) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  if (raw < 0 || raw > MAX_USAGE_TOKENS) return undefined;
  return Math.round(raw);
}

/**
 * Ce que cet appel PEUT coûter au maximum, tokens rapportés × tarif publié.
 *
 * Majorant assumé : les tokens de cache sont comptés en PLUS du prompt (ils y
 * sont souvent déjà inclus) et l'écriture de cache au plus cher des deux tarifs.
 * On cherche une borne, pas une facture — un majorant trop serré couperait des
 * lignes honnêtes, et c'est le seul risque qui compte ici.
 *
 * `null` quand le prix du modèle est inconnu (hors catalogue OpenRouter, BYOK
 * générique) : on ne devine pas un tarif, et seules les bornes dures s'appliquent.
 */
export function maxPlausibleCostUsd(
  tokens: UsageTokens,
  price: UsageModelPricing | null,
): number | null {
  const pricing = price?.pricing;
  if (!pricing) return null;
  const prompt = tokens.promptTokens ?? 0;
  const completion = tokens.completionTokens ?? 0;
  const cacheWrite = tokens.cacheWriteTokens ?? 0;
  const writeRate = Math.max(
    price?.cachePricing?.writeUsdPerMTok ?? 0,
    pricing.inputUsdPerMTok,
  );
  const usd =
    (prompt / 1_000_000) * pricing.inputUsdPerMTok +
    (completion / 1_000_000) * pricing.outputUsdPerMTok +
    (cacheWrite / 1_000_000) * writeRate;
  return roundUsd(usd);
}

/**
 * La ligne d'usage que la VM propose, vérifiée puis bornée.
 *
 * `estimated` de la VM est conservé quand la ligne passe telle quelle ; il est
 * FORCÉ quand on a remplacé le montant, parce que le chiffre écrit vient alors de
 * notre calcul et pas d'un relevé — l'admin finance ne doit jamais confondre les
 * deux (même règle que `abandonedSpend`).
 */
export function checkUsageClaim(
  body: Record<string, unknown>,
  price: UsageModelPricing | null,
): UsageClaimVerdict {
  const promptTokens = tokenField(body.promptTokens);
  const completionTokens = tokenField(body.completionTokens);
  const totalTokens = tokenField(body.totalTokens);
  const cachedTokens = tokenField(body.cachedTokens);
  const cacheWriteTokens = tokenField(body.cacheWriteTokens);
  if (
    promptTokens === undefined ||
    completionTokens === undefined ||
    totalTokens === undefined ||
    cachedTokens === undefined ||
    cacheWriteTokens === undefined
  ) {
    return { ok: false, reason: "token counts must be finite, positive and plausible" };
  }
  const tokens: UsageTokens = {
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
    cacheWriteTokens,
  };

  const rawCost = body.cost;
  if (rawCost != null && (typeof rawCost !== "number" || !Number.isFinite(rawCost))) {
    return { ok: false, reason: "cost must be a finite number" };
  }
  // LE SIGNE, et c'est tout le ticket : un montant négatif ne borne pas une
  // dépense, il en efface une autre. Le refus est net, jamais un `Math.max(0, …)`
  // silencieux — une VM qui poste ça a un problème qu'on veut voir.
  if (typeof rawCost === "number" && rawCost < 0) {
    return { ok: false, reason: "cost cannot be negative" };
  }
  if (typeof rawCost === "number" && rawCost > MAX_USAGE_COST_USD) {
    return { ok: false, reason: `cost exceeds the per-call ceiling ($${MAX_USAGE_COST_USD})` };
  }

  const estimated = body.estimated === true;
  if (typeof rawCost !== "number") {
    return { ok: true, ...tokens, cost: null, estimated };
  }

  /**
   * UN MONTANT SANS TOKENS N'EST PAS VÉRIFIABLE, et c'est le trou qu'ouvrirait la
   * suite si on le laissait passer : sans compteur, le majorant vaut zéro, donc
   * plafonner écrirait 0 sur une ligne honnête (de l'argent dépensé et jamais
   * compté), et ne pas plafonner offrirait à qui omet ses tokens le plein plafond
   * dur. Aucune des deux ne va. Un relevé de fournisseur porte TOUJOURS ses
   * tokens à côté de son montant : au-dessus du plancher, on l'exige.
   */
  const hasTokens =
    tokens.promptTokens != null || tokens.completionTokens != null || tokens.totalTokens != null;
  if (rawCost > USAGE_COST_FLOOR_USD && !hasTokens) {
    return { ok: false, reason: "a cost above the floor must come with its token counts" };
  }

  const computed = hasTokens ? maxPlausibleCostUsd(tokens, price) : null;
  const ceiling =
    computed === null ? null : Math.max(computed * USAGE_COST_TOLERANCE, USAGE_COST_FLOOR_USD);
  if (ceiling !== null && rawCost > ceiling) {
    return {
      ok: true,
      ...tokens,
      cost: computed ?? 0,
      estimated: true,
      clampedFrom: rawCost,
    };
  }
  return { ok: true, ...tokens, cost: roundUsd(rawCost), estimated };
}
