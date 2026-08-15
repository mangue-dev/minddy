/**
 * Niveau de raisonnement d'un run de l'agent de code (MIN-122). Logique PURE :
 * le vocabulaire (`off` / `minimal` / `low` / `medium` / `high` / `xhigh` /
 * `max`) et sa traduction en champs de requête, provider par provider.
 *
 * CE VOCABULAIRE EST CELUI DES MODÈLES, PAS LE NÔTRE. Il ne s'invente pas : il
 * est publié modèle par modèle dans `/models` d'OpenRouter (objet `reasoning`,
 * champ `supported_efforts`), et c'est de là qu'il descend jusqu'au sélecteur —
 * 128 modèles sur 406 en publient un, et deux d'entre eux ont rarement le même
 * (`high|medium|low`, `xhigh|high|medium|low|minimal`, `max|high|low`…). Ce que
 * l'écran propose est donc ce que le modèle CHOISI accepte, et rien d'autre
 * (`reasoningLevelsFor`) : trois paliers génériques appliqués à tous
 * n'affichaient ni ce qu'il savait faire de plus, ni ce qu'il ne savait pas
 * faire du tout.
 *
 * Partagé client + serveur (AUCUN import server-only), comme
 * `lib/agent-providers.ts` dont il lit la capacité : le sélecteur de lancement a
 * besoin de la liste des niveaux, la route de lancement de `isReasoningLevel`,
 * et la boucle de `reasoningRequestFields`. Un seul fichier plutôt que deux
 * moitiés qui pourraient diverger.
 *
 * UN SEUL vocabulaire produit, traduit au dernier moment : `reasoning: { effort }`
 * (OpenRouter), `reasoning_effort` (OpenAI/Gemini) ou `thinking` (la couche de
 * compatibilité Anthropic conserve ici son contrat natif).
 *
 * La gate est le registre : un provider sans `reasoningField` n'envoie RIEN.
 * C'est le défaut sûr — un champ inconnu envoyé à un serveur OpenAI-compatible
 * strict (BYOK generic) revient en 400, et un 400 tue le round.
 */

import { getAgentProvider, type AgentProviderId } from "./agent-providers";

export type ReasoningLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

/**
 * Tout le vocabulaire, du moins cher au plus cher. C'est celui d'OpenRouter
 * (`minimal`, `low`, `medium`, `high`, `xhigh`, `max`), à un mot près : leur
 * `none` est notre `off`, qui veut dire quelque chose d'un peu plus fort —
 * n'envoyer AUCUN champ de raisonnement, plutôt que d'en envoyer un qui demande
 * zéro. C'est le seul défaut sûr hors OpenRouter, où un champ inconnu revient en
 * 400 et tue le round.
 *
 * Cette liste n'est PAS ce que le sélecteur affiche : un modèle donné n'accepte
 * qu'une partie de ces valeurs, et c'est lui qui le dit (`reasoningLevelsFor`).
 */
export const REASONING_LEVELS: ReasoningLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

/**
 * Ce qu'on propose d'un modèle qui ne publie RIEN sur son raisonnement — un BYOK
 * direct, un modèle hors index, un provider dont on n'a pas d'index de capacités.
 *
 * Les quatre historiques, et pas les sept : proposer `xhigh` à un modèle dont on
 * ignore tout, c'est proposer un niveau qui sera silencieusement rabattu (chez
 * OpenRouter) ou refusé (ailleurs). Un sélecteur ne doit offrir que des choix qui
 * changent quelque chose.
 */
export const GENERIC_REASONING_LEVELS: ReasoningLevel[] = ["off", "low", "medium", "high"];

/**
 * Ce qu'un modèle dit de son propre raisonnement, tel que l'index OpenRouter le
 * publie (`/models`, objet `reasoning`). Lu côté serveur
 * ([openrouter-index.ts](server/agent/openrouter-index.ts)), il voyage jusqu'au
 * sélecteur avec le catalogue.
 *
 * On n'en garde que deux champs sur les cinq publiés, parce que ce sont les deux
 * qui changent l'écran. `default_effort` et `default_enabled` décrivent ce que le
 * modèle fait quand on ne demande rien — or on demande toujours quelque chose.
 * `supports_max_tokens` (10 modèles sur 406) ouvrirait une SECONDE forme de
 * réglage, un budget de tokens, et un sélecteur qui change de nature selon le
 * modèle est un sélecteur qu'on ne sait plus lire : OpenRouter traduit de toute
 * façon nos paliers en budget pour les modèles qui n'entendent que ça.
 */
export interface ModelReasoning {
  /**
   * Les paliers que CE modèle accepte, du moins cher au plus cher. Vide = il
   * raisonne, mais ne publie aucune énumération (c'est le cas des Claude) : on
   * retombe alors sur `GENERIC_REASONING_LEVELS`.
   */
  efforts: ReasoningLevel[];
  /**
   * Le modèle raisonne TOUJOURS (`mandatory`) : « sans raisonnement » n'est pas
   * une option à lui proposer — il refuse `none`, et le lui envoyer casse l'appel.
   */
  mandatory: boolean;
}

/**
 * Ce que le sélecteur affiche pour un modèle donné. Sans métadonnées (modèle
 * inconnu, provider sans index), les quatre paliers historiques ; avec, ceux que
 * le modèle publie, plus `off` quand il autorise qu'on ne raisonne pas.
 *
 * `null` (et non une liste vide) = ce modèle n'a AUCUNE capacité de raisonnement :
 * l'appelant montre alors un sélecteur inerte plutôt qu'un choix sans effet.
 */
export function reasoningLevelsFor(
  reasoning: ModelReasoning | null | undefined,
): ReasoningLevel[] {
  if (!reasoning) return GENERIC_REASONING_LEVELS;
  const efforts = reasoning.efforts.length > 0 ? reasoning.efforts : GENERIC_REASONING_LEVELS;
  const withoutOff = efforts.filter((l) => l !== "off");
  return reasoning.mandatory ? withoutOff : ["off", ...withoutOff];
}

/**
 * Rabat un niveau sur ce que le modèle accepte VRAIMENT. Sert au sélecteur (un
 * défaut perso à `xhigh` sur un modèle qui n'en veut pas doit s'afficher sur son
 * plus proche voisin, pas sur du vide) et au lancement.
 *
 * « Le plus proche » se lit sur l'échelle complète, dans les deux sens : d'abord
 * vers le bas (moins cher que demandé, jamais plus), puis vers le haut si le
 * modèle n'a rien de moins cher — un modèle qui n'accepte que `high` doit
 * recevoir `high`, même quand on lui demandait `low`.
 */
export function nearestReasoningLevel(
  level: ReasoningLevel,
  allowed: ReasoningLevel[],
): ReasoningLevel {
  if (allowed.includes(level)) return level;
  if (allowed.length === 0) return level;
  const rank = (l: ReasoningLevel) => REASONING_LEVELS.indexOf(l);
  const sorted = [...allowed].sort((a, b) => rank(a) - rank(b));
  const below = [...sorted].reverse().find((l) => rank(l) < rank(level));
  return below ?? sorted[0];
}

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
export const REASONING_REQUEST_KEYS = ["reasoning_effort", "reasoning", "thinking"] as const;

/** Ce qu'un `reasoning_effort` à plat accepte : le vocabulaire de l'API OpenAI. */
const COMPAT_EFFORTS: ReasoningLevel[] = ["minimal", "low", "medium", "high"];

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
  // Anthropic dépend de la famille de modèle (manuel jusqu'à 4.6, adaptatif à
  // partir de 4.7). Le traducteur model-aware de lib/ai-chat.ts s'en charge.
  if (field === "thinking") return {};
  /**
   * Les couches compat (openai, anthropic, google) ne connaissent que le
   * vocabulaire de l'API OpenAI. `xhigh` et `max` sont des paliers d'OpenRouter,
   * qui les rabat lui-même sur ce que le modèle accepte ; envoyés en direct, ils
   * reviennent en 400 et tuent le round. On rabat donc AVANT — perdre un cran de
   * réflexion vaut mieux que perdre le tour.
   */
  return { reasoning_effort: nearestReasoningLevel(level, COMPAT_EFFORTS) };
}

/**
 * Tokens de réflexion à prévoir EN PLUS de la réponse, par niveau. Ils servent
 * au plafond global et, pour les Claude qui acceptent encore le mode manuel, de
 * budget indicatif dans l'adaptateur model-aware.
 */
const REASONING_HEADROOM: Record<ReasoningLevel, number> = {
  off: 0,
  minimal: 512,
  low: 1024,
  medium: 2048,
  high: 4096,
  xhigh: 6144,
  max: 8192,
};

/** Budget indicatif derrière un palier, utilisé par l'adaptateur Anthropic. */
export function reasoningTokenBudget(level: ReasoningLevel): number {
  return REASONING_HEADROOM[level];
}

/**
 * Plafond de sortie interne à demander quand le raisonnement est actif. Les
 * tokens de réflexion sont comptés DANS ce plafond par les couches compat : à `high`, la
 * réflexion mangerait l'essentiel des 8192 du profil et tronquerait la réponse
 * **et les tool-calls** du round. On relève donc le plafond du surcoût attendu.
 * `undefined` en entrée (surface sans plafond) reste `undefined`.
 */
export function reasoningMaxTokens(
  base: number | undefined,
  level: ReasoningLevel | null | undefined,
): number | undefined {
  if (base === undefined) return undefined;
  if (!isReasoningLevel(level)) return base;
  return base + reasoningTokenBudget(level);
}

/**
 * Les quatre niveaux sont ouverts à TOUS, quota minddy compris : l'abonnement est
 * payé, il doit être utilisable en entier. Un `high` consomme le budget d'usage
 * mensuel plus vite, mais ne peut pas le dépasser — `checkAgentQuota` refuse le
 * lancement et la boucle s'arrête d'elle-même quand le budget est épuisé. Plafonner
 * le niveau en plus n'aurait protégé de rien, au prix d'une règle à expliquer.
 */
