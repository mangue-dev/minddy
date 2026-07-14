/**
 * Prompt caching de l'agent de code (MIN-46) — levier « capacité » (Tier 2). Sur
 * un run multi-rounds, le prompt système (issue + plan + conventions + discipline
 * outils) est STABLE mais renvoyé à chaque tour. On le marque d'un cache
 * breakpoint `cache_control:{type:"ephemeral"}` : les providers qui supportent le
 * prompt caching (Anthropic via OpenRouter en tête) réutilisent le préfixe caché
 * → coût et latence par appel fortement réduits. Les modèles sans caching
 * l'ignorent (OpenRouter n'échoue pas). Non-lossy : le contenu envoyé est
 * identique, seul un marqueur est ajouté.
 *
 * Logique PURE et TRANSIENTE : on ne mute pas l'historique (qui EST le
 * checkpoint, gardé en `content:string`) ; on produit un nouveau tableau destiné
 * au SEUL corps de requête. Gate provider assurée par l'appelant (agent-loop.ts).
 */

/** Bloc de texte OpenAI-compatible portant un cache breakpoint. */
export interface EphemeralTextPart {
  type: "text";
  text: string;
  cache_control: { type: "ephemeral" };
}

/**
 * Renvoie une COPIE des messages avec DEUX cache breakpoints (pour les providers
 * qui les supportent) : le message système, ET la fin du PRÉFIXE DE SEED (dernier
 * message non-assistant en tête = tâche + instructions repo). Ça cache le plus gros
 * bloc STABLE d'un run (au lieu du seul système), gros gain sur Anthropic via
 * OpenRouter. N'altère pas l'entrée (l'historique-checkpoint reste en string).
 */
export function markSystemPromptCache(
  messages: ReadonlyArray<{ role: string; content?: string | null }>,
): unknown[] {
  // Fin du préfixe de seed : dernier index avant le premier message `assistant`.
  let seedEnd = -1;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "assistant") break;
    seedEnd = i;
  }
  return messages.map((m, i) => {
    const isSystem = i === 0 && m.role === "system";
    const isSeedEnd = i === seedEnd && seedEnd > 0; // >0 : distinct du système seul
    if ((isSystem || isSeedEnd) && typeof m.content === "string" && m.content.length > 0) {
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
