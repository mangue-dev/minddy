/**
 * A model can end a round on a simple action announcement (`stop`),
 * especially when a commentary type output has been flattened into text by an OpenAI-compatible
 * layer. The protocol then says "finished", even if the phrase
 * says exactly the opposite.
 *
 * This detection remains deliberately narrow: a false negative costs a
 * wrong answer, a false positive would charge for a round that no one has
 * requested. It therefore targets the announcement formulations observed, followed by a
 * verb which implies a reading, an order or a modification.
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
