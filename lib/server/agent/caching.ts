/**
 * Prompt caching de l'agent de code (MIN-46) — levier « capacité » (Tier 2). Sur
 * un run multi-rounds, tout ce qui a déjà été envoyé l'est à nouveau à chaque
 * tour : le prompt système (issue + plan + conventions + discipline outils), puis
 * l'historique entier. On pose des cache breakpoints
 * `cache_control:{type:"ephemeral"}` : les providers qui supportent le prompt
 * caching (Anthropic via OpenRouter en tête) réutilisent le préfixe caché → coût
 * et latence par appel fortement réduits. Les modèles sans caching l'ignorent
 * (OpenRouter n'échoue pas), et ceux dont le cache est IMPLICITE — les `openai/*`,
 * qui cachent le plus long préfixe commun sans qu'on marque rien — n'en ont pas
 * besoin : c'est sur Anthropic que ce fichier décide de la facture. Non-lossy : le
 * contenu envoyé est identique, seul un marqueur est ajouté.
 *
 * La TTL reste celle de l'`ephemeral` (5 min), et c'est mesuré, pas supposé : dans
 * un tour, les appels se suivent à quelques secondes, et une lecture réarme la
 * TTL. Le seul écart au-delà de 5 min du gros run de MIN-101 est la frontière
 * ENTRE deux tours — que la TTL 1 h d'Anthropic couvrirait, au prix d'un write à
 * 2× au lieu de 1,25×, pour sauver le seul premier round du tour suivant.
 *
 * Logique PURE et TRANSIENTE : on ne mute pas l'historique (qui EST le
 * checkpoint, gardé en `content:string`) ; on produit un nouveau tableau destiné
 * au SEUL corps de requête. Gate provider assurée par l'appelant (agent-loop.ts).
 */

import type { AgentContentPart } from "./content";

/** Bloc de texte OpenAI-compatible portant un cache breakpoint. */
export interface EphemeralTextPart {
  type: "text";
  text: string;
  cache_control: { type: "ephemeral" };
}

/**
 * Renvoie une COPIE des messages avec TROIS cache breakpoints (pour les providers
 * qui les supportent) : le message système, la fin du PRÉFIXE DE SEED (dernier
 * message non-assistant en tête = tâche + instructions repo), et — GLISSANT — le
 * DERNIER message de l'historique. N'altère pas l'entrée (l'historique-checkpoint
 * reste en string).
 *
 * LE TROISIÈME EST CELUI QUI PAYE (MIN-242), et il manquait. Les deux premiers
 * cachent le seed, qui ne grossit pas ; dans une boucle à tool-calls c'est la
 * QUEUE qui grossit, et elle n'était marquée nulle part. Mesuré sur le gros run
 * de MIN-101 (`anthropic/claude-sonnet-5`, 171 appels, 27,85 $) : les tokens
 * cachés restent FIGÉS à 5 805 — le seed — pendant que le prompt passe de 5,8 k
 * à 70 k, soit 2,0 % de tokens cachés sur tout le run.
 *
 * Mesuré à nouveau en live, mêmes messages, deux bras, formes réelles de la
 * boucle (assistant porteur de `tool_calls`, résultat en `role:"tool"`) : 41,4 %
 * de tokens cachés et 0,1330 $ sans le breakpoint glissant, 74,9 % et 0,0807 $
 * avec (−39 % sur six rounds). Et l'écart GRANDIT avec le run — la part cachée
 * monte (71 → 87 %) au lieu de décroître, parce que chaque round lit le bloc que
 * le précédent a écrit.
 *
 * Trois marqueurs et pas plus : Anthropic en accepte quatre, et le quatrième
 * n'aurait rien de neuf à couvrir.
 */
export function markSystemPromptCache(
  messages: ReadonlyArray<{ role: string; content?: string | AgentContentPart[] | null }>,
): unknown[] {
  // Fin du préfixe de seed : dernier index avant le premier message `assistant`.
  let seedEnd = -1;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "assistant") break;
    seedEnd = i;
  }
  // Breakpoint GLISSANT : le dernier message marquable de l'historique. On
  // remonte tant que le contenu n'est pas une chaîne non vide — un message
  // `assistant` de tool-calls a un `content` nul, et un contenu multipart n'est
  // pas marquable (cf. plus bas). Il ne sert à rien tant qu'il retombe DANS le
  // seed : les deux premiers breakpoints couvrent déjà ce préfixe-là.
  let tailEnd = -1;
  for (let i = messages.length - 1; i > seedEnd; i--) {
    const c = messages[i].content;
    if (typeof c === "string" && c.length > 0) {
      tailEnd = i;
      break;
    }
  }
  return messages.map((m, i) => {
    const isSystem = i === 0 && m.role === "system";
    const isSeedEnd = i === seedEnd && seedEnd > 0; // >0 : distinct du système seul
    const isTailEnd = i === tailEnd;
    // Un contenu DÉJÀ multipart (une image, MIN-111) passe tel quel : le seed est
    // du texte, et poser un breakpoint au milieu de parties hétérogènes n'aurait
    // pas de préfixe stable à cacher.
    if ((isSystem || isSeedEnd || isTailEnd) && typeof m.content === "string" && m.content.length > 0) {
      const part: EphemeralTextPart = {
        type: "text",
        text: m.content,
        cache_control: { type: "ephemeral" },
      };
      return { ...m, content: [part] };
    }
    return m;
  });
}
