"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

/**
 * Une réponse @Numo EN DIRECT, sur le topic privé `numo-comment:{commentId}`
 * (migration 20260909090000_numo_comment_live_stream).
 *
 * L'assistant streame parce que son panneau tient la connexion SSE de la route
 * qui fait tourner la boucle. Une réponse en commentaire ne peut pas : elle
 * s'écrit dans un after(), sans navigateur au bout du fil. Le serveur diffuse
 * donc le texte du round sur le topic du commentaire (lib/server/assistant/
 * comment-live.ts), et c'est ici qu'on le reçoit — ~4 fois par seconde, sans une
 * seule écriture en base ni un seul refetch du fil.
 *
 * Le refetch tant que la réponse est 'working' reste en place : c'est le filet
 * (message perdu, onglet endormi, abonnement pas encore joint).
 */

export interface CommentLive {
  /** Réponse telle qu'écrite jusqu'ici. */
  text: string;
  /** Outil en cours — il prend le pas sur le texte à l'écran. */
  tool: string | null;
}

interface StreamPayload {
  text?: unknown;
  tool?: unknown;
  at?: unknown;
}

type Listener = (payload: StreamPayload) => void;

interface Entry {
  channel: RealtimeChannel | null;
  listeners: Set<Listener>;
  /** Dernier abonné parti pendant l'ouverture → ne pas joindre après coup. */
  closed: boolean;
}

/**
 * UN canal par commentaire, quel que soit le nombre de fils montés dessus : le
 * même ticket peut être ouvert en panneau latéral et en modale, et un même
 * socket ne peut pas joindre deux fois le même topic.
 */
const channels = new Map<string, Entry>();

function subscribeComment(commentId: string, listener: Listener): () => void {
  let entry = channels.get(commentId);
  if (!entry) {
    const fresh: Entry = { channel: null, listeners: new Set(), closed: false };
    entry = fresh;
    channels.set(commentId, fresh);
    const supabase = getSupabase();
    // Même précaution que le RealtimeProvider : pousser le token AVANT le join,
    // sinon le canal privé refuse l'abonnement (jeton anon).
    void supabase.realtime.setAuth().then(() => {
      if (fresh.closed) return;
      const channel = supabase.channel(`numo-comment:${commentId}`, {
        config: { private: true },
      });
      channel.on("broadcast", { event: "stream" }, ({ payload }) => {
        for (const l of fresh.listeners) l((payload ?? {}) as StreamPayload);
      });
      channel.subscribe();
      fresh.channel = channel;
    });
  }
  entry.listeners.add(listener);

  const opened = entry;
  return () => {
    opened.listeners.delete(listener);
    if (opened.listeners.size > 0) return;
    opened.closed = true;
    channels.delete(commentId);
    if (opened.channel) void getSupabase().removeChannel(opened.channel);
  };
}

/**
 * `active` = la réponse est en cours d'écriture (assistant_status 'working'). Au
 * repos on ne s'abonne pas : il n'y a rien à diffuser, et le commentaire fini est
 * celui de la base.
 *
 * Renvoie `null` tant que rien n'est arrivé — l'appelant retombe alors sur la
 * ligne en base, qui est ce que voit un onglet ouvert en cours de route.
 */
export function useCommentLive(
  commentId: string | null,
  active: boolean
): CommentLive | null {
  const [live, setLive] = useState<CommentLive | null>(null);
  // Horodatage du dernier message retenu : deux diffusions parties à 250 ms
  // d'écart peuvent arriver dans le désordre, et un texte plus ancien effacerait
  // la fin de celui déjà affiché.
  const lastAt = useRef(0);

  useEffect(() => {
    setLive(null);
    lastAt.current = 0;
    if (!commentId || !active) return;

    return subscribeComment(commentId, (p) => {
      const at = typeof p.at === "number" ? p.at : 0;
      if (at < lastAt.current) return;
      lastAt.current = at;
      const text = typeof p.text === "string" ? p.text : "";
      const tool = typeof p.tool === "string" ? p.tool : null;
      // Diffusion à vide : plus rien à montrer en direct (échec), on rend la main
      // à la ligne en base.
      setLive(text || tool ? { text, tool } : null);
    });
  }, [commentId, active]);

  return live;
}
