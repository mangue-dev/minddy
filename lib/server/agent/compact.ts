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

/** Forme minimale d'un message (compatible AgentChatMessage). */
export interface CompactMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
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
  let bytes = typeof m.content === "string" ? m.content.length : 0;
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
  /** Message système à conserver en tête (ou null s'il n'y en a pas). */
  systemMessage: T | null;
  /** Bloc du milieu à résumer. */
  toSummarize: T[];
  /** Queue récente à préserver verbatim. */
  tail: T[];
}

/**
 * Calcule un plan de compaction sûr, ou null s'il n'y a rien à compacter utilement.
 * `keepRecentBytes` fixe la taille (approx.) de la queue préservée. On recule depuis
 * la fin en accumulant les octets jusqu'à ce budget, puis on avance le curseur de
 * queue tant qu'il pointe sur un message `tool` (jamais commencer la queue sur un
 * résultat orphelin).
 */
export function planCompaction<T extends CompactMessage>(
  messages: T[],
  opts: { keepRecentBytes: number },
): CompactionPlan<T> | null {
  const hasSystem = messages[0]?.role === "system";
  const systemMessage = hasSystem ? messages[0] : null;
  const bodyStart = hasSystem ? 1 : 0;

  // Recule depuis la fin jusqu'au budget de queue.
  let bytes = 0;
  let k = messages.length;
  for (let i = messages.length - 1; i >= bodyStart; i--) {
    bytes += messageBytes(messages[i]);
    k = i;
    if (bytes >= opts.keepRecentBytes) break;
  }

  // Ne jamais démarrer la queue sur un résultat de tool orphelin.
  while (k < messages.length && messages[k].role === "tool") k++;

  // Rien de sûr à préserver, ou rien de significatif à résumer → on s'abstient.
  if (k >= messages.length) return null;
  const toSummarize = messages.slice(bodyStart, k);
  if (toSummarize.length < MIN_SUMMARIZE_MESSAGES) return null;

  return { systemMessage, toSummarize, tail: messages.slice(k) };
}

/** Coupe une chaîne à `max` caractères (les résultats de tools sont compactés). */
function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
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
        const text = (m.content ?? "").trim();
        return `ASSISTANT: ${text}${text && calls ? "\n" : ""}${calls}`.trim();
      }
      if (m.role === "tool") return `TOOL RESULT: ${cap(String(m.content ?? ""), 600)}`;
      if (m.role === "user") {
        const content = (m.content ?? "").trim();
        // Garde anti-résumé-de-résumé : un résumé de compaction antérieur est déjà
        // condensé — on le présente comme tel pour que le résumeur préserve ses
        // faits sans les ré-étendre (drift).
        if (content.startsWith(COMPACT_SUMMARY_PREFIX)) {
          return `PRIOR SUMMARY (already condensed — carry its facts forward as-is):\n${content.slice(COMPACT_SUMMARY_PREFIX.length).trim()}`;
        }
        return `USER: ${content}`;
      }
      return `${m.role.toUpperCase()}: ${(m.content ?? "").trim()}`;
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
