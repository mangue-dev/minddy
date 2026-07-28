/**
 * Compaction du contexte de l'agent de code (MIN-46) — durcissement (Tier 4).
 * Sur un run TRÈS long (multi-chunks, beaucoup de raisonnement), l'historique peut
 * approcher la fenêtre du modèle même après élagage des sorties de tools. On résume
 * alors le MILIEU périmé en un unique message, en préservant :
 *   • le message système (verbatim, toujours en tête) ;
 *   • une QUEUE récente de messages (verbatim) — contexte immédiat ;
 *   • un résumé du bloc compacté (tâche, travail fait, état, prochaines étapes,
 *     contraintes/décisions), inséré comme message `user`.
 *
 * Logique PURE et testable. La SÛRETÉ tient au point de rupture : on ne coupe
 * jamais entre un `assistant` porteur de tool_calls et ses résultats `tool`
 * (sinon l'API renvoie 400). Règle : la queue préservée ne commence JAMAIS par un
 * message `tool` — ce qui garantit que le bloc compacté se termine sur un round
 * complet (les résultats d'un tool_call suivent immédiatement leur assistant, donc
 * si messages[k] n'est pas un `tool`, alors messages[k-1] n'est pas un assistant
 * en attente de résultats).
 */

import { contentChars, imageCount, textOf, type AgentContentPart } from "./content";

/** Forme minimale d'un message (compatible AgentChatMessage). */
export interface CompactMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | AgentContentPart[] | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

/** Approximation grossière : ~4 caractères par token (sous-estime le code). */
const CHARS_PER_TOKEN = 4;
/** En dessous, la compaction n'est pas rentable (bloc trop petit). */
const MIN_SUMMARIZE_MESSAGES = 4;

/** Octets « de contexte » d'un message (contenu + arguments des tool_calls). */
function messageBytes(m: CompactMessage): number {
  let bytes = contentChars(m.content);
  if (m.tool_calls) {
    for (const tc of m.tool_calls) {
      bytes += (tc.function?.arguments?.length ?? 0) + (tc.function?.name?.length ?? 0);
    }
  }
  return bytes;
}

/** Estimation du nombre de tokens de l'historique (proxy caractères). */
export function estimateTokens(messages: ReadonlyArray<CompactMessage>): number {
  let chars = 0;
  for (const m of messages) chars += messageBytes(m);
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

export interface CompactionPlan<T extends CompactMessage> {
  /**
   * Préfixe de seed préservé VERBATIM : la suite de messages non-assistant en tête
   * (système + message de tâche + instructions repo + résumés antérieurs). Contient
   * les critères d'acceptation et les conventions — on ne les paraphrase JAMAIS.
   */
  seedPrefix: T[];
  /** Bloc du milieu à résumer. */
  toSummarize: T[];
  /** Queue récente à préserver verbatim. */
  tail: T[];
}

/**
 * Calcule un plan de compaction sûr, ou null s'il n'y a rien à compacter utilement.
 * On préserve le PRÉFIXE DE SEED (messages non-assistant en tête) verbatim, on recule
 * depuis la fin jusqu'au budget de queue, puis on avance le curseur de queue tant
 * qu'il pointe sur un message `tool` (jamais commencer la queue sur un résultat
 * orphelin). Le milieu restant est résumé.
 */
export function planCompaction<T extends CompactMessage>(
  messages: T[],
  opts: { keepRecentBytes: number },
): CompactionPlan<T> | null {
  // Préfixe de seed = messages non-assistant en tête (même logique que dropOldestRound).
  let prefixEnd = 0;
  while (prefixEnd < messages.length && messages[prefixEnd].role !== "assistant") prefixEnd++;
  const seedPrefix = messages.slice(0, prefixEnd);

  // Recule depuis la fin jusqu'au budget de queue.
  let bytes = 0;
  let k = messages.length;
  for (let i = messages.length - 1; i >= prefixEnd; i--) {
    bytes += messageBytes(messages[i]);
    k = i;
    if (bytes >= opts.keepRecentBytes) break;
  }

  // Ne jamais démarrer la queue sur un résultat de tool orphelin.
  while (k < messages.length && messages[k].role === "tool") k++;

  // Rien de sûr à préserver, ou rien de significatif à résumer → on s'abstient.
  if (k >= messages.length) return null;
  const toSummarize = messages.slice(prefixEnd, k);
  if (toSummarize.length < MIN_SUMMARIZE_MESSAGES) return null;

  return { seedPrefix, toSummarize, tail: messages.slice(k) };
}

/**
 * Élague le round le plus ancien de l'historique EN PLACE, en préservant le préfixe
 * de seed ET l'appariement tool_call↔résultat. Dernier recours quand le provider
 * renvoie un 400 « contexte trop long » : on retente le même appel avec un
 * historique raccourci.
 *
 *   • Préfixe de seed = messages[0] s'il est `system`, PLUS tous les messages non-
 *     assistant en tête jusqu'au (exclu) PREMIER message `assistant` — c.-à-d.
 *     système + message de tâche + instructions repo + éventuels résumés/messages
 *     user antérieurs. Jamais élagué.
 *   • Round le plus ancien = ce premier `assistant`, avec ses résultats `tool`
 *     immédiatement suivants (s'il porte des tool_calls). Bloc contigu retiré tel quel.
 *
 * Retourne false (et ne mute rien) s'il n'y a aucun `assistant` à retirer. Après
 * retrait, l'invariant tient : pas de `tool` orphelin, chaque assistant(tool_calls)
 * immédiatement suivi de ses résultats.
 */
export function dropOldestRound<T extends CompactMessage>(messages: T[]): boolean {
  // Le premier `assistant` marque la fin du préfixe de seed.
  let start = -1;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "assistant") {
      start = i;
      break;
    }
  }
  if (start === -1) return false; // rien à élaguer

  // Le round = l'assistant + tous ses résultats `tool` contigus (jamais orphelins).
  let end = start + 1;
  while (end < messages.length && messages[end].role === "tool") end++;

  messages.splice(start, end - start);
  return true;
}

/** Coupe une chaîne à `max` caractères (les résultats de tools sont compactés). */
function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

/**
 * Texte d'un message pour la transcription du résumeur. Une partie IMAGE n'y est
 * pas rejouée (MIN-111) : un résumé porte les décisions, pas les pixels — et
 * réinjecter les maquettes dans un sous-appel dont la sortie est du texte ne ferait
 * que payer deux fois. Le marqueur dit qu'elles ont existé ; le texte qui
 * l'accompagne (le résultat de `read_attachment`) en garde le nom de fichier.
 */
function summaryText(m: CompactMessage): string {
  const text = textOf(m.content).trim();
  const images = imageCount(m.content);
  if (images === 0) return text;
  const marker = `[${images} image${images > 1 ? "s" : ""} attached — not replayed in this summary]`;
  return text ? `${text}\n${marker}` : marker;
}

/**
 * Sérialise un bloc de messages en transcription texte pour le résumeur. On passe
 * par du texte (et non les messages bruts) pour que le sous-appel de résumé soit
 * INSENSIBLE à l'appariement tool_call↔résultat et aux particularités providers.
 */
export function serializeForSummary(messages: ReadonlyArray<CompactMessage>): string {
  return messages
    .map((m) => {
      if (m.role === "assistant") {
        const calls =
          m.tool_calls
            ?.map((tc) => `→ ${tc.function.name}(${cap(tc.function.arguments ?? "", 300)})`)
            .join("\n") ?? "";
        const text = summaryText(m);
        return `ASSISTANT: ${text}${text && calls ? "\n" : ""}${calls}`.trim();
      }
      if (m.role === "tool") return `TOOL RESULT: ${cap(summaryText(m), 600)}`;
      if (m.role === "user") {
        const content = summaryText(m);
        // Garde anti-résumé-de-résumé : un résumé de compaction antérieur est déjà
        // condensé — on le présente comme tel pour que le résumeur préserve ses
        // faits sans les ré-étendre (drift).
        if (content.startsWith(COMPACT_SUMMARY_PREFIX)) {
          return `PRIOR SUMMARY (already condensed — carry its facts forward as-is):\n${content.slice(COMPACT_SUMMARY_PREFIX.length).trim()}`;
        }
        return `USER: ${content}`;
      }
      return `${m.role.toUpperCase()}: ${summaryText(m)}`;
    })
    .join("\n\n");
}

/** Instruction système du sous-appel de résumé. */
export const SUMMARIZE_INSTRUCTION = `You are compacting an in-progress autonomous coding session to save context. Summarize the transcript below into a concise but COMPLETE progress note. Capture, in this order:
1. The task / goal being implemented.
2. What has been done so far — files created or edited, and the essence of each change.
3. The current state and any in-progress or partially done work.
4. The next steps that remain.
5. Any decisions, constraints, conventions, or explicit user instructions that must be respected going forward.
Preserve exact file paths, symbol names, and identifiers. Do NOT reproduce raw file contents. Output ONLY the summary, no preamble.`;

/** Préfixe du message `user` qui porte le résumé injecté. */
export const COMPACT_SUMMARY_PREFIX =
  "[Earlier steps of this run were compacted to save context. Summary of the work so far:]";
