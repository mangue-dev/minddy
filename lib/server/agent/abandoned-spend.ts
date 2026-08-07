import type { ModelPricing } from "@/lib/model-multiplier";
import type { NormalizedUsage } from "@/lib/server/ai-usage";

/**
 * Ce qu'a coûté un essai de stream ABANDONNÉ (MIN-216) — logique PURE, testable
 * sans réseau ni base.
 *
 * Le problème qu'elle règle : la ligne `ai_usage` d'un round ne s'écrit qu'au
 * RETOUR de `streamCompletion`, et l'objet `usage` d'OpenRouter n'arrive qu'au
 * tout dernier chunk du flux. Un essai coupé avant ce chunk — « Stop » de
 * l'utilisateur, stream figé, 5xx en plein flux, ou simplement un essai que la
 * boucle de reprise jette pour en relancer un autre — n'avait donc ni coût
 * rapporté ni ligne au ledger. Or le fournisseur, lui, a facturé : chez ceux qui
 * supportent l'annulation elle « stops model processing and billing » à
 * l'instant de la coupure, et chez les autres la réponse complète est facturée.
 * La dépense sortait du quota du compte, du plafond de run (`get_ai_run_spend`)
 * et de la facture, sur un geste déclenchable à volonté.
 *
 * Ce qu'on écrit à la place : les tokens observés au prix publié du modèle. Un
 * MINORANT dans le cas le plus courant (le prompt est facturé en entier, la
 * complétion peut avoir continué sans nous) — et c'est la bonne direction : la
 * doctrine du plafond de run est déjà de prendre le plus grand de deux
 * minorants. La ligne se marque `estimated` pour que l'admin finance ne
 * confonde jamais ce chiffre-là avec un chiffre relevé.
 */

/** L'état d'un essai au moment où on le jette. */
export interface AbandonedStream {
  generationId: string | null;
  modelUsed: string | null;
  /** Usage rapporté par le fournisseur si le chunk final est arrivé — rare ici. */
  usage: NormalizedUsage;
  /** Tokens du prompt ENVOYÉ : facturés dès que le fournisseur a répondu. */
  estimatedPromptTokens: number;
  /** Tokens REÇUS avant la coupure (texte + raisonnement accumulés). */
  estimatedCompletionTokens: number;
}

/** Ce qu'on pose au ledger pour cet essai. */
export interface AbandonedSpend {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  /** `null` quand le prix du modèle est inconnu : on ne devine pas un tarif. */
  cost: number | null;
  /** Le coût vient d'un calcul, pas du fournisseur. */
  estimated: boolean;
}

/** `ai_usage.cost` est un `numeric(12,6)` : on arrondit là où la colonne coupe. */
function roundUsd(usd: number): number {
  return Math.round(usd * 1e6) / 1e6;
}

function positiveInt(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/**
 * Tokens et coût à écrire pour un essai abandonné.
 *
 * Le coût rapporté GAGNE quand il existe (le flux a eu le temps de rendre son
 * dernier chunk avant la coupure) : la ligne est alors une vraie facture, et
 * elle ne se marque pas estimée. Sinon on calcule, et `pricing` absent — modèle
 * hors catalogue OpenRouter, endpoint BYOK générique — rend un coût `null`
 * plutôt qu'un zéro : zéro se lirait « cet appel était gratuit », et ferait
 * exactement le trou qu'on rebouche. La ligne existe quand même, avec ses tokens
 * et son id de génération : de quoi retrouver la dépense chez le fournisseur.
 */
export function abandonedSpend(
  stream: AbandonedStream,
  pricing: ModelPricing | null | undefined,
): AbandonedSpend {
  const promptTokens = stream.usage.promptTokens ?? positiveInt(stream.estimatedPromptTokens);
  const completionTokens =
    stream.usage.completionTokens ?? positiveInt(stream.estimatedCompletionTokens);
  const totalTokens = stream.usage.totalTokens ?? promptTokens + completionTokens;

  if (stream.usage.cost != null) {
    return { promptTokens, completionTokens, totalTokens, cost: stream.usage.cost, estimated: false };
  }

  const cost = pricing
    ? roundUsd(
        (promptTokens / 1_000_000) * pricing.inputUsdPerMTok +
          (completionTokens / 1_000_000) * pricing.outputUsdPerMTok,
      )
    : null;
  return { promptTokens, completionTokens, totalTokens, cost, estimated: true };
}
