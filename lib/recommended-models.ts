/**
 * Les modèles CONSEILLÉS : la courte liste qu'un utilisateur voit en ouvrant le
 * picker, avant d'avoir tapé quoi que ce soit.
 *
 * Le catalogue OpenRouter compte plus de 300 modèles de texte. Les montrer par
 * ordre alphabétique, c'est ouvrir sur `agentica-org/…` et `ai21/…` — un rang
 * qui ne dit rien de ce qui marche, et qui laisse le choix entier à charge de
 * quelqu'un qui voulait juste lancer un agent. La liste ci-dessous est un AVIS :
 * ce que minddy conseille, dans l'ordre.
 *
 * **Le critère est le coût autant que la capacité**, et c'est le plan qui le
 * fixe. Le Pro est à 20 €/mois pour 15 $ d'usage inclus, et le plafond de
 * multiplicateur va de ×15 (Go) à ×40 (Pro) — cf. `lib/billing-plans.ts`. Un
 * modèle au-delà de ×40 n'est lançable par personne : il n'a rien à faire ici,
 * si capable soit-il. La liste vise donc la frontière de Pareto entre ce qui
 * code bien et ce qui se paye, l'essentiel sous le plafond Go.
 *
 * Ce n'est PAS un filtre : le reste du catalogue reste accessible à la
 * recherche, et l'admin peut réécrire la liste sans déploiement
 * (`app_config.recommended_models`, cf. `lib/ai-model-config.ts`). D'où la
 * forme — de simples ids.
 *
 * C'est un ENSEMBLE, pas une séquence : l'ordre d'affichage est CALCULÉ, du
 * moins cher au plus cher (`resolveRecommended`). Le seul qui reste vrai — les
 * prix d'OpenRouter bougent, et un rang figé le jour où on l'a écrit finirait
 * par annoncer une échelle de coût qui n'existe plus. L'ordre du tableau
 * ci-dessous n'est donc qu'une commodité de lecture.
 *
 * AUCUN import server-only ici : ce module est tiré dans le client.
 */

/**
 * Le repli produit, écrit en code. Les multiplicateurs en commentaire sont
 * relatifs au défaut de minddy (`deepseek/deepseek-v4-flash`), tels que les
 * prix OpenRouter les donnaient en août 2026 — indicatifs, pas contractuels :
 * c'est `lib/model-multiplier.ts` qui les recalcule pour de bon, et le picker
 * qui les affiche.
 *
 * Rangé ici du moins cher au plus cher pour qu'il se relise, mais c'est le prix
 * du jour qui fixe l'ordre réel à l'affichage : ces commentaires vieilliront,
 * pas le tri.
 */
export const DEFAULT_RECOMMENDED_MODELS: string[] = [
  // ×0,4 — 1 M de contexte pour un cinquième du défaut. Le cran « mécanique ».
  "qwen/qwen3.7-flash",
  // ×1 — le défaut de minddy, et la référence de l'échelle.
  "deepseek/deepseek-v4-flash",
  // ×1,1
  "z-ai/glm-4.7-flash",
  // ×3,6 — 1 M de contexte, le moins cher des vraiment capables.
  "minimax/minimax-m3",
  // ×3,8
  "qwen/qwen3.7-plus",
  // ×4 — meilleur open-weights sur SWE-bench Pro, et sur le code au long cours.
  "z-ai/glm-5.2",
  // ×4,2
  "google/gemini-3.1-flash-lite",
  // ×4,5 — en tête sur SWE-bench Verified, à un neuvième du prix de Sonnet.
  "deepseek/deepseek-v4-pro",
  // ×5,4
  "openai/gpt-5.1-codex-mini",
  // ×6,7
  "google/gemini-3.5-flash-lite",
  // ×10
  "moonshotai/kimi-k2.7-code",
  // ×14 — le dernier qui passe sous le plafond du plan Go.
  "anthropic/claude-haiku-4.5",
  // ×19 — au-delà de Go : visible et grisé là-bas, lançable en Pro.
  "x-ai/grok-4.5",
  // ×29 — le haut de gamme qu'un Pro peut encore se payer (plafond ×40).
  "anthropic/claude-sonnet-5",
];

/**
 * Liste lisible tirée de la valeur `app_config`, ou `null` quand il n'y a RIEN
 * d'exploitable (vide, JSON illisible, pas un tableau, aucun id valide).
 *
 * `null` est un verdict, pas une erreur : le serveur y répond par le repli — un
 * réglage cassé ne doit pas vider le picker — et l'API admin par un 400, pour
 * que personne n'enregistre une liste qui ne servira jamais. Même parseur des
 * deux côtés, comme pour les favoris de sous-agents : ce que l'écran d'admin
 * accepte est exactement ce que le picker lira.
 *
 * Les doublons sont écrasés plutôt que refusés : deux fois le même id dans un
 * `CommandItem` donnerait deux lignes identiques dont une seule réagit.
 */
export function parseRecommendedModels(raw: string | null | undefined): string[] | null {
  if (!raw?.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const ids = new Set<string>();
  for (const entry of parsed) {
    const id = typeof entry === "string" ? entry.trim() : "";
    if (id) ids.add(id);
  }
  return ids.size > 0 ? [...ids] : null;
}
