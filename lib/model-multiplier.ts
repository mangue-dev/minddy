/**
 * Multiplicateur de coût d'un modèle — ce que le picker affiche (« ×2,4 ») et ce
 * que le plan plafonne (`BillingPlan.maxModelMultiplier`).
 *
 * Définition : moyenne des prix d'entrée et de sortie au million de tokens,
 * rapportée à celle du MODÈLE PAR DÉFAUT DE MINDDY (`app_config.agent_model`).
 * Le baseline vaut donc toujours ×1, et toute l'échelle se recalcule seule le
 * jour où l'admin change ce défaut — une table de multiplicateurs écrite en dur
 * aurait menti dès la génération de modèles suivante.
 *
 * La moyenne (entrée + sortie) / 2 est volontairement grossière : le vrai ratio
 * dépend de la forme du trafic (un agent lit bien plus qu'il n'écrit, et le
 * cache de prompt change encore la donne). Ce qu'on montre est un ordre de
 * grandeur comparable d'un modèle à l'autre, pas une facture.
 *
 * Module PARTAGÉ client/serveur : aucun import server-only. La valeur se calcule
 * côté serveur (le catalogue de modèles), le client ne fait que la formater.
 */

export interface ModelPricing {
  /** USD par million de tokens d'entrée. */
  inputUsdPerMTok: number;
  /** USD par million de tokens de sortie. */
  outputUsdPerMTok: number;
}

/** Prix moyen entrée/sortie, au million de tokens. */
export function averageUsdPerMTok(pricing: ModelPricing): number {
  return (pricing.inputUsdPerMTok + pricing.outputUsdPerMTok) / 2;
}

/**
 * Multiplicateur d'un modèle face au baseline, déjà ARRONDI (cf.
 * `roundMultiplier`). `null` quand il ne veut rien dire : prix inconnus (modèle
 * hors catalogue OpenRouter, provider BYOK) ou baseline gratuit — le rapport
 * serait une division par zéro. Un `null` ne bloque jamais : on n'interdit pas
 * sur une ignorance.
 */
export function modelCostMultiplier(
  pricing: ModelPricing | null | undefined,
  baseline: ModelPricing | null | undefined,
): number | null {
  if (!pricing || !baseline) return null;
  const base = averageUsdPerMTok(baseline);
  if (!(base > 0)) return null;
  return roundMultiplier(averageUsdPerMTok(pricing) / base);
}

/**
 * L'arrondi CANONIQUE : la valeur affichée EST la valeur comparée au plafond.
 * Sans lui, un modèle à ×1,549 s'afficherait « ×1,5 » — dans le plafond Free —
 * et serait refusé au lancement (1,549 > 1,5). L'écran mentirait.
 */
export function roundMultiplier(value: number): number {
  if (value >= 10) return Math.round(value);
  if (value >= 1) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

/** « ×2,4 » — le séparateur décimal suit la locale. */
export function formatMultiplier(value: number, locale: string): string {
  return `×${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}`;
}

/**
 * Le modèle tient-il dans le plafond du plan ? Un multiplicateur inconnu passe :
 * refuser sur une ignorance bloquerait les modèles trop récents pour l'index et
 * tous les endpoints qui ne publient pas leurs prix.
 */
export function isMultiplierWithinPlan(
  multiplier: number | null | undefined,
  maxMultiplier: number,
): boolean {
  return multiplier == null || multiplier <= maxMultiplier;
}
