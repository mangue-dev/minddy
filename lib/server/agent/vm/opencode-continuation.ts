/**
 * Un modèle peut terminer un round sur une simple annonce d'action (`stop`),
 * notamment quand une sortie de type commentary a été aplatie en texte par une
 * couche OpenAI-compatible. Le protocole dit alors « fini », même si la phrase
 * dit exactement l'inverse.
 *
 * Cette détection reste volontairement étroite : un faux négatif coûte une
 * mauvaise réponse, un faux positif ferait payer un round que personne n'a
 * demandé. Elle vise donc les formulations d'annonce observées, suivies d'un
 * verbe qui implique une lecture, une commande ou une modification.
 */
export function looksLikeUnexecutedPreamble(text: string): boolean {
  const normalized = text
    .trim()
    .replace(/^(?:(?:hello|hi|bonjour|salut)\b[\s!,.:'’—-]*)/i, "")
    .trim();

  const action =
    "(?:analy[sz]e|browse|check|examine|explore|inspect|inventory|list|look|open|read|review|run|search|test|verify|" +
    "analyser|chercher|examiner|explorer|faire|inspecter|inventorier|lancer|lire|lister|modifier|ouvrir|parcourir|regarder|tester|vérifier)";

  return new RegExp(
    `^(?:i(?:'|’)ll|i will|i am going to|i(?:'|’)m going to|let me|` +
      `je vais(?: d'abord)?|je (?:vais )?commencer par|laissez-moi|permettez-moi de)\\s+${action}\\b`,
    "i",
  ).test(normalized);
}

export const OPENCODE_CONTINUATION_REPAIR =
  "Your previous message only announced intended actions; it was not a final answer. " +
  "Do not announce them again. Use the available tools now, complete the user's request, " +
  "then return the actual findings in your final reply.";
