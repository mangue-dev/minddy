/**
 * Niveau de raisonnement d'un run de l'agent de code (MIN-122). Logique PURE :
 * le vocabulaire (`off` / `low` / `medium` / `high`) et sa traduction en champs
 * de requête, provider par provider.
 *
 * Partagé client + serveur (AUCUN import server-only), comme
 * `lib/agent-providers.ts` dont il lit la capacité : le sélecteur de lancement a
 * besoin de la liste des niveaux, la route de lancement de `isReasoningLevel`,
 * et la boucle de `reasoningRequestFields`. Un seul fichier plutôt que deux
 * moitiés qui pourraient diverger.
 *
 * UN SEUL vocabulaire de wire : `effort`, sous deux formes seulement —
 * `reasoning: { effort }` (OpenRouter) et `reasoning_effort` (les trois couches
 * compat OpenAI : openai, anthropic, google). Ni `thinking.budget_tokens` ni
 * `thinkingConfig` : ce sont des champs des API NATIVES Anthropic et Gemini, et
 * minddy tape leur couche `/chat/completions` (cf. docs/reasoning-levels.md).
 *
 * La gate est le registre : un provider sans `reasoningField` n'envoie RIEN.
 * C'est le défaut sûr — un champ inconnu envoyé à un serveur OpenAI-compatible
 * strict (BYOK generic) revient en 400, et un 400 tue le round.
 */

import { getAgentProvider, type AgentProviderId } from "./agent-providers";

export type ReasoningLevel = "off" | "low" | "medium" | "high";

/** Ordre d'affichage du sélecteur, du moins cher au plus cher. */
export const REASONING_LEVELS: ReasoningLevel[] = ["off", "low", "medium", "high"];

/**
 * Défaut : `medium` (« Standard » dans l'UI). L'agent réfléchit un peu avant
 * d'agir, parce que c'est ce qu'on veut d'un agent de code dans le cas général —
 * `off` était le défaut d'atterrissage de MIN-122, choisi pour n'introduire aucun
 * changement de comportement le jour de la livraison, pas parce qu'il servait mieux
 * l'utilisateur. Le surcoût reste borné par le budget d'usage (`checkAgentQuota`),
 * et un endpoint qui refuse le champ est rattrapé par la relance sans champ de
 * `streamCompletion` (cf. docs/reasoning-levels.md).
 */
export const DEFAULT_REASONING_LEVEL: ReasoningLevel = "medium";

/** Valide une entrée d'API / une valeur lue en base. */
export function isReasoningLevel(value: unknown): value is ReasoningLevel {
  return typeof value === "string" && (REASONING_LEVELS as string[]).includes(value);
}

/** Normalise n'importe quoi en niveau valide (défaut `DEFAULT_REASONING_LEVEL`). */
export function toReasoningLevel(value: unknown): ReasoningLevel {
  return isReasoningLevel(value) ? value : DEFAULT_REASONING_LEVEL;
}

/**
 * Les clés de raisonnement qu'on peut poser dans un corps de requête. Sert aussi
 * au garde-fou 400 de la boucle : un message d'erreur qui cite l'une d'elles
 * désigne un endpoint qui REJETTE le champ au lieu de l'ignorer.
 */
export const REASONING_REQUEST_KEYS = ["reasoning_effort", "reasoning"] as const;

/**
 * Champs à fusionner dans le corps `/chat/completions` pour demander ce niveau.
 * `{}` (rien à envoyer) quand : niveau `off`, valeur inconnue, ou provider sans
 * capacité déclarée au registre (`generic`, et tout provider futur tant qu'on
 * n'a pas constaté qu'il accepte le champ).
 */
export function reasoningRequestFields(
  level: ReasoningLevel | null | undefined,
  provider: AgentProviderId,
): Record<string, unknown> {
  if (!isReasoningLevel(level) || level === "off") return {};
  const field = getAgentProvider(provider)?.requestProfile.reasoningField;
  if (!field) return {};
  // `exclude: false` : on VEUT recevoir la trace pour la persister repliée dans
  // le fil — ce qu'on ne veut pas, c'est la streamer (cf. l'indicateur du feed).
  if (field === "reasoning") return { reasoning: { effort: level, exclude: false } };
  return { reasoning_effort: level };
}

/**
 * Tokens de réflexion à prévoir EN PLUS de la réponse, par niveau. Ce ne sont pas
 * des budgets envoyés au provider (le wire ne parle qu'en `effort`) : ils servent
 * à relever `max_tokens`, cf. `reasoningMaxTokens`.
 */
const REASONING_HEADROOM: Record<ReasoningLevel, number> = {
  off: 0,
  low: 1024,
  medium: 2048,
  high: 4096,
};

/**
 * Plafond `max_tokens` à envoyer quand le raisonnement est actif. Les tokens de
 * réflexion sont comptés DANS `max_tokens` par les couches compat : à `high`, la
 * réflexion mangerait l'essentiel des 8192 du profil et tronquerait la réponse
 * **et les tool-calls** du round. On relève donc le plafond du surcoût attendu.
 * `undefined` en entrée (provider qui n'envoie pas `max_tokens`) reste `undefined`.
 */
export function reasoningMaxTokens(
  base: number | undefined,
  level: ReasoningLevel | null | undefined,
): number | undefined {
  if (base === undefined) return undefined;
  if (!isReasoningLevel(level)) return base;
  return base + REASONING_HEADROOM[level];
}

/**
 * Les quatre niveaux sont ouverts à TOUS, quota minddy compris : l'abonnement est
 * payé, il doit être utilisable en entier. Un `high` consomme le budget d'usage
 * mensuel plus vite, mais ne peut pas le dépasser — `checkAgentQuota` refuse le
 * lancement et la boucle s'arrête d'elle-même quand le budget est épuisé. Plafonner
 * le niveau en plus n'aurait protégé de rien, au prix d'une règle à expliquer.
 */
