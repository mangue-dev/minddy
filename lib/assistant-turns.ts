import type { AssistantMessage } from "./assistant-types";

/**
 * Découpage du fil Numo en TOURS, à parité avec le fil de l'agent de code
 * (components/agent/agent-event-feed.tsx) : tout ce que Numo a fait AVANT sa
 * réponse (narration intermédiaire, appels d'outils) se replie dans un accordéon
 * « Travaille depuis X » / « A travaillé pendant X », et seule la réponse finale
 * reste visible dessous. L'utilisateur suit le travail en cours, puis lit la
 * réponse — au lieu de recevoir tout le tour d'un bloc.
 *
 * Un TOUR = un message utilisateur, puis tout ce que Numo produit jusqu'à sa
 * réponse. Les messages utilisateur restent toujours visibles et séparent les tours.
 */

export type AssistantTurn = {
  kind: "turn";
  /**
   * Clé stable sur toute la vie du tour (dérivée du message utilisateur qui
   * l'ouvre) → la MÊME instance d'accordéon persiste du travail à la réponse,
   * d'où l'animation de fermeture automatique en fin de tour. Préfixée : le
   * message qui l'ouvre est rendu en bloc FRÈRE, avec son propre id pour clé.
   */
  key: string;
  /** Déroulé à replier : les messages intermédiaires du tour. */
  work: AssistantMessage[];
  /** Réponse qui clôt le tour, rendue SOUS l'accordéon (`null` = pas encore là). */
  summary: AssistantMessage | null;
  /** ISO — début du tour (l'envoi de l'utilisateur, pas le 1er pas produit). */
  startedAt: string;
  /** ISO, ou `null` tant que le tour travaille (chrono en direct). */
  endedAt: string | null;
  active: boolean;
};

export type AssistantBlock =
  | { kind: "message"; message: AssistantMessage }
  | AssistantTurn;

/** Messages que le fil ne rend pas : ni travail, ni réponse. */
function isHidden(m: AssistantMessage): boolean {
  return m.role === "tool" || m.role === "system";
}

/**
 * Message qui clôt un tour : du texte (la réponse), ou une question posée à
 * l'utilisateur — un `ask_user` termine le tour, la boucle attend la réponse.
 */
function closesTurn(m: AssistantMessage): boolean {
  if (m.role !== "assistant") return false;
  if (m.content?.trim()) return true;
  return (m.tool_calls ?? []).some((tc) => tc.function.name === "ask_user");
}

export function buildAssistantBlocks(
  messages: AssistantMessage[],
  options: {
    /** Numo travaille → le dernier tour est ACTIF (accordéon ouvert, chrono live). */
    active?: boolean;
    /**
     * Le round EN VOL a déjà produit quelque chose (texte en train de s'écrire ou
     * appel d'outil parti). Le dernier message reçu n'est alors plus la queue du
     * tour : son texte redevient de la narration et repart dans le déroulé, sinon
     * il resterait affiché SOUS un travail plus récent que lui.
     */
    pendingWork?: boolean;
  } = {},
): AssistantBlock[] {
  const { active = false, pendingWork = false } = options;
  const blocks: AssistantBlock[] = [];
  let work: AssistantMessage[] = [];
  // Message utilisateur qui a ouvert le tour en cours : porte sa clé et l'instant
  // où le chrono démarre (l'envoi — c'est là que l'attente commence).
  let opener: AssistantMessage | null = null;

  const flush = (isActive: boolean) => {
    const last = work[work.length - 1];
    const summary =
      last && closesTurn(last) && !(isActive && pendingWork) ? last : null;
    const folded = summary ? work.slice(0, -1) : work;

    // Rien à replier (réponse directe sans travail, ou tour vide) → messages tels
    // quels : un accordéon vide n'apprendrait rien. Le tour ACTIF garde en
    // revanche son bloc, qui accueille le chrono du travail en cours.
    if (!isActive && folded.length === 0) {
      for (const m of work) blocks.push({ kind: "message", message: m });
      work = [];
      return;
    }

    const startedAt =
      opener?.created_at || folded[0]?.created_at || last?.created_at || "";
    blocks.push({
      kind: "turn",
      key: `turn-${opener?.id ?? folded[0]?.id ?? last?.id ?? blocks.length}`,
      work: folded,
      summary,
      startedAt,
      endedAt: isActive ? null : (summary ?? last)?.created_at || startedAt,
      active: isActive,
    });
    work = [];
  };

  for (const m of messages) {
    if (isHidden(m)) continue;
    if (m.role === "user") {
      // Un message utilisateur clôt le tour précédent (terminé, ou interrompu
      // sans réponse — son travail s'affiche alors tel quel) et ouvre le suivant.
      flush(false);
      blocks.push({ kind: "message", message: m });
      opener = m;
      continue;
    }
    work.push(m);
  }
  flush(active);

  return blocks;
}
