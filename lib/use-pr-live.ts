"use client";

import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { parsePrLiveParts, prLiveQueryKeys, pullRequestTopic } from "./pr-live";

/**
 * Le direct d'UNE pull request, du point de vue de l'écran qui la regarde.
 *
 * Le panneau PR charge quatre caches indépendants (`["pull-request", id]`,
 * `["pr-comments", id]`, `["pr-commits", id]`, `["pr-review-comments", …]`),
 * tous servis par la forge à la demande. Aucun ne pollait : le fil d'une PR ne
 * bougeait qu'au retour d'un geste local ou à la fin d'un run de Numo. Un
 * commentaire posté sur github.com, une approbation, un commit poussé, un fil
 * résolu : rien n'atteignait le panneau ouvert avant un rechargement.
 *
 * Le topic `pull-request:{id}` porte des messages `changed` qui NOMMENT les
 * parties touchées ; on invalide les caches correspondants et React Query va
 * relire. Rien de plus : le contenu se lit avec le token du lecteur (MIN-144),
 * pousser ce qu'un autre a lu serait faux.
 *
 * Topic dédié plutôt que le `project:{id}` existant, pour la même raison
 * qu'`agent-run:{id}` : seuls les onglets qui REGARDENT cette PR s'y abonnent,
 * au lieu d'arroser tous les membres du projet pour un fil que personne d'autre
 * n'a ouvert. La LISTE, elle, passe bien par le topic projet (le trigger de la
 * migration) — ce sont deux besoins différents.
 */

/**
 * Coalescing par clé. Une review GitHub arrive en RAFALE — un
 * `pull_request_review` puis N `pull_request_review_comment` — et chaque message
 * demanderait son propre aller-retour de forge. Fenêtre plus large que celle du
 * provider (200 ms) : ici un refetch coûte un appel d'API distante, pas une
 * requête PostgREST.
 */
const INVALIDATE_COALESCE_MS = 500;

interface Listener {
  onChanged: (parts: ReturnType<typeof parsePrLiveParts>) => void;
}

interface Entry {
  channel: RealtimeChannel | null;
  listeners: Set<Listener>;
  closed: boolean;
}

/** UN canal par PR, quel que soit le nombre de vues montées dessus. */
const channels = new Map<string, Entry>();

function subscribePr(prId: string, listener: Listener): () => void {
  let entry = channels.get(prId);
  if (!entry) {
    const fresh: Entry = { channel: null, listeners: new Set(), closed: false };
    entry = fresh;
    channels.set(prId, fresh);
    const supabase = getSupabase();
    // Le token AVANT le join, sinon le canal privé refuse l'abonnement.
    void supabase.realtime.setAuth().then(() => {
      if (fresh.closed) return;
      const channel = supabase.channel(pullRequestTopic(prId), {
        config: { private: true },
      });
      channel.on("broadcast", { event: "changed" }, ({ payload }) => {
        const parts = parsePrLiveParts((payload as { parts?: unknown } | null)?.parts);
        if (parts.length === 0) return;
        for (const l of fresh.listeners) l.onChanged(parts);
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
    channels.delete(prId);
    if (opened.channel) void getSupabase().removeChannel(opened.channel);
  };
}

export function usePrLive(prId: string | null, enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!prId || !enabled) return;

    // Coalescing en TRAÎNE, comme le pont du provider : le premier message
    // programme l'invalidation, ceux de la fenêtre montent dedans.
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const invalidate = (key: QueryKey) => {
      const hash = JSON.stringify(key);
      if (timers.has(hash)) return;
      timers.set(
        hash,
        setTimeout(() => {
          timers.delete(hash);
          void queryClient.invalidateQueries({ queryKey: key });
        }, INVALIDATE_COALESCE_MS),
      );
    };

    const stop = subscribePr(prId, {
      onChanged: (parts) => {
        for (const key of prLiveQueryKeys(prId, parts)) invalidate(key);
      },
    });

    return () => {
      stop();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, [prId, enabled, queryClient]);
}
