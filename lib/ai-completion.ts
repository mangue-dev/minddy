/** Ignore quoted examples when checking a model's own closing statement. */
function closingStatement(text: string): string {
  const prose = text
    .replace(/```[\s\S]*?(?:```|$)/g, "")
    .replace(/~~~[\s\S]*?(?:~~~|$)/g, "")
    .replace(/^\s*>.*$/gm, "")
    .replace(/`[^`\n]*`/g, "")
    .trim()
    .replace(/^(?:hello|hi|bonjour|salut)\b[\s!,.:'’—-]*/i, "");
  // An observation can precede the pending action, as in the i18n incident.
  return prose.split(/(?:[.!?]\s+|\n+)/).filter(Boolean).at(-1)?.trim() ?? "";
}

/** Recognize a closing announcement of work that still needs to happen. */
export function looksLikePendingAction(text: string): boolean {
  const closing = closingStatement(text).replace(
    /^(?:(?:now|next|then|finally|maintenant|ensuite|puis|enfin)[,!:]?\s+)+/i, "",
  );
  // Optional follow-up offers and recommendations are legitimate final answers.
  if (/\b(?:if you|when you|on request|if (?:needed|desired|requested|necessary)|si vous|si tu|à votre demande|si (?:besoin|nécessaire|souhaité|demandé)|au besoin|sur demande|en cas de besoin)(?=\s|[.!?,;:]|$)/i.test(closing)) {
    return false;
  }
  const action =
    "(?:analy[sz]e|browse|check|examine|explore|generate|inspect|inventory|launch|list|look|open|create|publish|submit|read|review|run|search|test|verify|" +
    "analyser|chercher|examiner|explorer|faire|générer|inspecter|inventorier|lancer|lire|lister|modifier|ouvrir|créer|publier|soumettre|parcourir|regarder|relancer|tester|vérifier)";
  const future = new RegExp(
    `^(?:i(?:'|’)ll|i will|i am going to|i(?:'|’)m going to|let me|` +
      `je vais(?: d'abord)?|je (?:vais )?commencer par|laissez-moi|permettez-moi de)\\s+${action}\\b`,
    "i",
  );
  const ongoing = /^(?:i am|i['’]m)\s+(?:checking|examining|generating|inspecting|launching|opening|creating|publishing|submitting|reading|reviewing|running|searching|testing|verifying)\b|^(?:je\s+|j['’])(?:génère|vérifie|examine|inspecte|lance|relance|ouvre|crée|publie|soumets|lis|teste|cherche|regarde|modifie)\b/i;
  return future.test(closing) || ongoing.test(closing);
}

/** A text serialization is never authorization to execute a tool. */
export function hasSerializedToolCall(text: string): boolean {
  const prose = text
    .replace(/```[\s\S]*?(?:```|$)/g, "")
    .replace(/~~~[\s\S]*?(?:~~~|$)/g, "")
    .replace(/`[^`\n]*`/g, "")
    .replace(/^\s*>.*$/gm, "");
  return /<tool_call(?:\b|$)/i.test(prose);
}
