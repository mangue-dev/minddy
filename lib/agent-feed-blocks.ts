import type { FeedItem, MessageItem } from "@/components/agent/agent-event-feed";

/**
 * LE DÉCOUPAGE DU FIL DE L'AGENT EN BLOCS, à part du rendu : chaque TOUR clos par
 * un `summary` devient un bloc `turn` (déroulé repliable + résumé final visible
 * dessous), le reste (messages user, tour en cours ou en pause sans résumé) reste
 * en items `loose` affichés tels quels.
 *
 * Ici plutôt que dans le composant parce que c'est la moitié du fil qui a des
 * RÈGLES — et qu'aucune ne s'exerçait tant qu'elle vivait dans un `.tsx` (la suite
 * ne regarde que `lib/**`). Le type `FeedItem` reste, lui, chez le composant qui le
 * construit : l'import est un import de TYPE, effacé à la compilation.
 */

/**
 * Un TOUR : accordéon du déroulé.
 *  • ACTIF (agent au travail) → ouvert par défaut, chrono live « Travaille depuis X ».
 *  • TERMINÉ (résumé final) → se referme tout seul, « A travaillé pendant X » + résumé.
 * `key` dérive du 1er item de travail (stable entre l'état actif et terminé du même
 * tour) → la MÊME instance persiste, d'où l'animation de fermeture auto.
 */
export type Block =
  | {
      type: "turn";
      key: string;
      work: FeedItem[];
      /** Ce qui CLÔT le tour et reste visible sous le déroulé replié : la réponse
       *  du modèle, ou la carte de budget épuisé (le tour s'arrête là aussi). */
      summary: TurnCloser | null;
      /** Bloc(s) « fichiers changés » du tour — rendus SOUS le résumé, hors accordéon. */
      files: FeedItem[];
      startedAt: string;
      endedAt: string | null;
      active: boolean;
      /** Le tour s'est arrêté SANS conclure (stop de l'utilisateur) → une ligne
       *  le dit sous le déroulé. Absent quand une erreur, juste en dessous, dit
       *  déjà pourquoi il s'est arrêté. */
      interrupted?: boolean;
    }
  | { type: "loose"; item: FeedItem };

/** Clé stable d'un item (id d'event) — sert de clé de tour via son 1er travail. */
function itemKey(it: FeedItem): string {
  return it.kind === "message" ? it.message.id : it.id;
}

/** Items qui referment un tour : la réponse finale, ou l'arrêt sur budget épuisé. */
export type TurnCloser = MessageItem | Extract<FeedItem, { kind: "quota" }>;

function closesTurn(it: FeedItem): it is TurnCloser {
  return it.kind === "quota" || (it.kind === "message" && !!it.isSummary);
}

/**
 * Items qu'un tour ARRÊTÉ garde SOUS son déroulé replié, jamais dedans : ce qu'il
 * a poussé (fichiers changés) et ce qui explique son arrêt (erreur du harnais).
 * Ce sont les deux seules choses qu'on veut lire sans avoir à déplier.
 */
function staysBelowTurn(it: FeedItem): boolean {
  return it.kind === "files" || (it.kind === "note" && it.variant === "error");
}

export function buildBlocks(items: FeedItem[], active: boolean): Block[] {
  const blocks: Block[] = [];
  let work: FeedItem[] = [];
  const flush = () => {
    for (const it of work) blocks.push({ type: "loose", item: it });
    work = [];
  };

  // Dernier tour poussé : reçoit le bloc « fichiers changés » qui le suit (l'event
  // arrive APRÈS le résumé qui a déjà refermé le tour).
  const lastTurn = (): Extract<Block, { type: "turn" }> | null => {
    const b = blocks[blocks.length - 1];
    return b && b.type === "turn" ? b : null;
  };

  for (const it of items) {
    // Bloc « fichiers changés » : rattaché au tour qu'il clôt (rendu sous sa réponse).
    // Sans tour immédiatement avant (résumé lâche, ou tour actif) → item libre.
    if (it.kind === "files") {
      // Jamais la liste du tour EN COURS sous le tour PRÉCÉDENT : le direct
      // devance les events (il ne passe pas par la base), donc `work` peut être
      // encore vide quand la première édition arrive — et le bloc se serait rangé
      // sous la réponse d'avant.
      const turn = work.length === 0 && !it.live ? lastTurn() : null;
      if (turn) turn.files.push(it);
      else work.push(it);
      continue;
    }
    // Un message user sépare les tours : il reste visible, et clôt tout travail en
    // cours non résumé (tour mis en pause) → affiché déplié.
    if (it.kind === "message" && it.message.role === "user") {
      flush();
      blocks.push({ type: "loose", item: it });
      continue;
    }
    // Clôture du tour (réponse finale, ou budget épuisé) : le travail se replie, ce
    // qui clôt reste visible dessous.
    if (closesTurn(it)) {
      if (work.length > 0) {
        blocks.push({
          type: "turn",
          key: itemKey(work[0]),
          work,
          summary: it,
          files: [],
          startedAt: work[0].createdAt || it.createdAt,
          endedAt: (it.kind === "message" ? it.endedAt : null) || it.createdAt,
          active: false,
        });
        work = [];
      } else {
        // Aucun travail à replier → on montre le résumé tel quel.
        blocks.push({ type: "loose", item: it });
      }
      continue;
    }
    work.push(it);
  }
  // Ce qui reste n'est PAS du travail — une liste de fichiers en direct, une erreur —
  // et n'ouvre donc pas de tour à lui tout seul. Sans ce test, la liste vivante qui
  // survit une seconde ou deux au résumé (le direct ne la lâche qu'au `files_changed`
  // de fin de tour) fabriquait un SECOND accordéon sous la réponse, avec son propre
  // chrono : le tour se dédoublait à l'écran, comme si un nouveau venait de s'ouvrir.
  if (work.length > 0 && work.every(staysBelowTurn)) {
    flush();
  } else if (active && work.length > 0) {
    // Travail restant sans réponse finale. L'agent TRAVAILLE → tour ACTIF (accordéon
    // ouvert, chrono live).
    // Réponse en train de s'écrire : elle prend la place du résumé, sous
    // l'accordéon, exactement là où le message final se posera.
    const tail = work[work.length - 1];
    const liveAnswer = tail.kind === "message" && tail.isLiveAnswer ? tail : null;
    blocks.push({
      type: "turn",
      key: itemKey(work[0]),
      work: liveAnswer ? work.slice(0, -1) : work,
      summary: liveAnswer,
      files: [],
      startedAt: work[0].createdAt,
      endedAt: null,
      active: true,
    });
    work = [];
  } else if (work.length > 0) {
    // AU REPOS avec un tour qui n'a jamais conclu : il a été arrêté — « stopper »
    // de l'utilisateur, le plus souvent. C'est un tour comme un autre, et il garde
    // donc son accordéon, replié sur « A travaillé pendant X ». Il se déversait
    // jusqu'ici déplié dans le fil, chrono compris : cliquer « stopper » effaçait
    // la seule ligne qui disait depuis combien de temps l'agent travaillait, et
    // étalait tout son déroulé à la place.
    const endedAt = work[work.length - 1].createdAt || null;
    const below: FeedItem[] = [];
    while (work.length > 0 && staysBelowTurn(work[work.length - 1])) {
      below.unshift(work.pop()!);
    }
    if (work.length > 0) {
      blocks.push({
        type: "turn",
        key: itemKey(work[0]),
        work,
        summary: null,
        files: below,
        startedAt: work[0].createdAt,
        endedAt,
        active: false,
        // Une erreur DIT déjà pourquoi le tour s'arrête là ; « interrompu »
        // sous elle ne ferait que la répéter, moins bien.
        interrupted: !below.some((it) => it.kind === "note" && it.variant === "error"),
      });
      work = [];
    } else {
      // Rien à replier (le tour n'est qu'une erreur d'amorçage) → tel quel.
      work = below;
    }
  }
  flush();
  return blocks;
}
