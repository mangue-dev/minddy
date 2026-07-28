import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Afficheur d'une réponse @Numo pendant qu'elle s'écrit (migration
 * 20260909090000_numo_comment_live_stream).
 *
 * Deux canaux, et la répartition entre les deux est tout l'intérêt :
 *
 *   LE DIRECT — le texte du round, diffusé sur le topic privé
 *     `numo-comment:{id}` à la cadence de `LIVE_FLUSH_MS`. Éphémère : rien n'est
 *     écrit en base, rien n'est refetché, le fil ouvert repeint et voilà.
 *   LA BASE — les seules transitions qui comptent : l'outil en cours, la fin, un
 *     échec. Rejouables, donc lisibles par l'onglet qui arrive en cours de route
 *     ou qui a manqué un message.
 *
 * Avant, tout passait par la base : un UPDATE toutes les 900 ms, un refetch
 * complet du fil derrière chacun. Le texte arrivait par blocs et la fin du
 * message n'apparaissait qu'à l'écriture finale.
 *
 * On tape l'endpoint HTTP de Realtime plutôt que d'ouvrir un websocket, pour la
 * même raison que l'agent de code (lib/server/agent/live.ts) : la boucle tourne
 * dans un after() qui peut être coupé à tout moment, un POST sans état s'y prête
 * mieux qu'une connexion à maintenir. La clé de service autorise la diffusion
 * sur un topic privé.
 *
 * Le direct est best-effort de bout en bout : une diffusion ratée ne doit jamais
 * faire échouer une réponse — le fil poll tant qu'elle est 'working'.
 */

/** Cadence du direct, alignée sur celle de l'agent de code (agent-loop.ts). */
const LIVE_FLUSH_MS = 250;

export function numoCommentTopic(commentId: string): string {
  return `numo-comment:${commentId}`;
}

/** Charge utile du direct : l'état COMPLET du round, jamais un delta — un
 *  message perdu se rattrape donc au suivant, sans trou dans le texte. */
export interface NumoCommentLive {
  /** Réponse telle qu'écrite jusqu'ici. */
  text: string;
  /** Outil en cours, s'il y en a un : il prend le pas sur le texte à l'écran. */
  tool: string | null;
  /** Horodatage d'émission (ms). Le client jette ce qui arrive dans le désordre.
   *  Un compteur ne conviendrait pas : deux POST partis à 250 ms d'écart peuvent
   *  très bien arriver dans l'autre sens, et un texte plus ancien effacerait la
   *  fin de celui déjà affiché. */
  at: number;
}

async function broadcast(commentId: string, payload: NumoCommentLive): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            topic: numoCommentTopic(commentId),
            event: "stream",
            payload,
            private: true,
          },
        ],
      }),
    });
  } catch {
    // Le fil poll tant que la réponse est 'working' : au pire, un temps de retard.
  }
}

/** La réponse en train de s'écrire, vue du serveur. */
export interface CommentDisplay {
  /** Texte du round tel qu'écrit jusqu'ici — diffusé, throttlé, jamais en base. */
  stream(text: string): void;
  /** Un outil démarre : en base (l'onglet qui arrive doit le voir) et en direct. */
  tool(name: string): void;
  /** Fin de la réponse : le texte complet, puis l'état figé. */
  finish(body: string): Promise<void>;
  /** Échec : corps vide + statut 'error', le fil rend sa ligne localisée. */
  fail(): Promise<void>;
}

export function commentDisplay(
  service: SupabaseClient,
  commentId: string
): CommentDisplay {
  let currentTool: string | null = null;
  let lastFlushAt = 0;
  let lastFlushLen = -1;

  // Les écritures se suivent à la queue leu leu. Elles partaient jusqu'ici en
  // fire-and-forget : rien ne garantissait que la dernière demandée soit la
  // dernière appliquée, et un UPDATE partiel doublant l'UPDATE final laissait le
  // commentaire tronqué pour de bon, en statut 'done'.
  let writes: Promise<void> = Promise.resolve();
  const write = (fields: Record<string, unknown>): Promise<void> => {
    writes = writes.then(async () => {
      const { error } = await service
        .from("comments")
        .update(fields)
        .eq("id", commentId);
      if (error) console.error("[numo-comment] update failed:", error.message);
    });
    return writes;
  };

  const push = (text: string): void => {
    void broadcast(commentId, { text, tool: currentTool, at: Date.now() });
  };

  return {
    stream(text) {
      // Le modèle écrit : l'outil précédent est terminé. Une seule écriture à la
      // bascule — pas une par fragment de texte.
      if (currentTool !== null) {
        currentTool = null;
        void write({ assistant_tool: null });
      }
      const now = Date.now();
      if (text.length === lastFlushLen || now - lastFlushAt < LIVE_FLUSH_MS) return;
      lastFlushAt = now;
      lastFlushLen = text.length;
      push(text);
    },

    tool(name) {
      currentTool = name;
      // Le round d'après repart d'un texte vide : sans ça, sa première diffusion
      // pourrait tomber sur la même longueur que la dernière du round précédent
      // et se faire filtrer.
      lastFlushLen = -1;
      push("");
      void write({ assistant_tool: name });
    },

    async finish(body) {
      currentTool = null;
      // Le texte complet part EN DIRECT d'abord : l'écran est à jour tout de
      // suite. Sans ce flush, les derniers fragments — retenus par le throttle —
      // n'arrivaient qu'avec le refetch déclenché par l'écriture ci-dessous, une
      // bonne seconde plus tard, et la fin du message tombait d'un bloc.
      push(body);
      await write({
        body,
        assistant_status: "done",
        assistant_tool: null,
      });
    },

    async fail() {
      currentTool = null;
      // Diffusion à vide : le fil lâche le direct et retombe sur la ligne en
      // base, que l'écriture qui suit passe en 'error'.
      push("");
      await write({
        body: "",
        assistant_status: "error",
        assistant_tool: null,
      });
    },
  };
}
