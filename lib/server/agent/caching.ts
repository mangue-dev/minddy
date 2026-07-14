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
 * Renvoie une COPIE des messages où le message système (contenu string non vide)
 * porte un cache breakpoint. Les autres messages sont inchangés. N'altère pas
 * l'entrée.
 */
export function markSystemPromptCache(
  messages: ReadonlyArray<{ role: string; content?: string | null }>,
): unknown[] {
  return messages.map((m) => {
    if (m.role === "system" && typeof m.content === "string" && m.content.length > 0) {
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
