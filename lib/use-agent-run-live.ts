"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import type { AgentRunEvent } from "./agent-api";

/**
 * Le fil d'une session de l'agent de code EN DIRECT (topic privé
 * `agent-run:{runId}`, migration 20260908090000_agent_live_stream).
 *
 * Numo streame parce que son fil tient la connexion SSE de la route qui fait
 * tourner la boucle. L'agent de code ne peut pas : sa boucle tourne en tâche de
 * fond, sans navigateur au bout. Le serveur diffuse donc deux choses sur le topic
 * du run (lib/server/agent/live.ts), et c'est ici qu'on les reçoit :
 *
 *   `stream` — le texte du round en cours, ~4 fois par seconde. Rendu comme
 *              queue vivante du fil, puis remplacé par le vrai message.
 *   `event`  — une ligne `agent_run_events` fraîchement insérée, poussée
 *              directement dans le cache du fil : les tool-calls et la réponse
 *              apparaissent à l'instant au lieu d'attendre le poll.
 *
 * Le polling de `useAgentRunEventsQuery` reste en place : c'est le filet (message
 * perdu, onglet endormi, abonnement pas encore joint).
 */

export interface AgentRunLive {
  /** Réponse du modèle telle qu'écrite jusqu'ici. */
  text: string;
  /** Trace de raisonnement, quand le modèle en émet. */
  reasoning: string;
  /** Appels d'outils déjà amorcés dans ce round : >0 ⇒ narration, le tour continue. */
  tools: number;
  /** ISO — premier instant où ce round a écrit quelque chose (chrono du tour). */
  startedAt: string;
}

interface StreamPayload {
  text?: unknown;
  reasoning?: unknown;
  tools?: unknown;
  at?: unknown;
}

interface Listener {
  onStream: (payload: StreamPayload) => void;
  onEvent: (row: AgentRunEvent) => void;
}

interface Entry {
  channel: RealtimeChannel | null;
  listeners: Set<Listener>;
  /** Dernier abonné parti pendant l'ouverture → ne pas joindre après coup. */
  closed: boolean;
}

/**
 * UN canal par run, quel que soit le nombre de fils montés dessus : deux vues du
 * même run coexistent (la modale d'un ticket au-dessus de la page Agents), et un
 * même socket ne peut pas joindre deux fois le même topic.
 */
const channels = new Map<string, Entry>();

function subscribeRun(runId: string, listener: Listener): () => void {
  let entry = channels.get(runId);
  if (!entry) {
    const fresh: Entry = { channel: null, listeners: new Set(), closed: false };
    entry = fresh;
    channels.set(runId, fresh);
    const supabase = getSupabase();
    // Même précaution que le RealtimeProvider : pousser le token AVANT le join,
    // sinon le canal privé refuse l'abonnement (jeton anon).
    void supabase.realtime.setAuth().then(() => {
      if (fresh.closed) return;
      const channel = supabase.channel(`agent-run:${runId}`, {
        config: { private: true },
      });
      channel.on("broadcast", { event: "stream" }, ({ payload }) => {
        for (const l of fresh.listeners) l.onStream((payload ?? {}) as StreamPayload);
      });
      channel.on("broadcast", { event: "event" }, ({ payload }) => {
        const row = (payload as { row?: AgentRunEvent } | null)?.row;
        if (!row?.id) return;
        for (const l of fresh.listeners) l.onEvent(row);
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
    channels.delete(runId);
    if (opened.channel) void getSupabase().removeChannel(opened.channel);
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * `active` = l'agent travaille. Au repos on ne s'abonne pas : il n'y a rien à
 * diffuser et le fil est figé jusqu'au prochain message.
 */
export function useAgentRunLive(
  runId: string | null,
  active: boolean,
): AgentRunLive | null {
  const queryClient = useQueryClient();
  const [live, setLive] = useState<AgentRunLive | null>(null);
  // Horodatage du dernier `stream` retenu : deux envois partis à 250 ms d'écart
  // peuvent arriver dans le désordre, et un texte plus ancien effacerait la fin
  // de celui déjà affiché.
  const lastAt = useRef(0);

  useEffect(() => {
    setLive(null);
    lastAt.current = 0;
    if (!runId || !active) return;

    return subscribeRun(runId, {
      onStream: (p) => {
        const at = typeof p.at === "number" ? p.at : 0;
        if (at < lastAt.current) return;
        lastAt.current = at;
        const text = str(p.text);
        const reasoning = str(p.reasoning);
        // Envoi À VIDE : les vrais events du round sont posés, ils prennent le
        // relais à l'écran.
        if (!text && !reasoning) {
          setLive(null);
          return;
        }
        setLive((prev) => ({
          text,
          reasoning,
          tools: typeof p.tools === "number" ? p.tools : 0,
          // Le chrono du tour date du PREMIER signe de vie du round, pas du dernier.
          startedAt: prev?.startedAt ?? new Date().toISOString(),
        }));
      },
      onEvent: (row) => {
        // Un event posé clôt la phase d'écriture du round : le vrai message
        // arrive, le provisoire s'efface. Sans ça, les deux se superposeraient
        // le temps que le serveur envoie sa purge (un insert plus tard).
        setLive(null);
        // Le cache n'est patché QUE s'il existe déjà : le créer ici ferait passer
        // la requête pour fraîche et sauterait son chargement initial.
        queryClient.setQueryData<{ events: AgentRunEvent[] }>(
          ["agent-run-events", runId],
          (old) => {
            if (!old) return old;
            if (old.events.some((e) => e.id === row.id)) return old;
            return { events: [...old.events, row].sort((a, b) => a.seq - b.seq) };
          },
        );
      },
    });
  }, [runId, active, queryClient]);

  return live;
}
