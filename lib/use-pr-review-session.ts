"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { fetchPullRequestAiReviewApi, type PrReviewSession } from "./agent-api";
import { isPrReviewActive, prReviewTopic, type PrReviewEvent } from "./pr-review-run";

/**
 * La session de review d'une PR par Numo, du point de vue de l'écran : ce qui
 * est en base (rejoué à l'ouverture) plus ce qui arrive en direct.
 *
 * Deux sources, et l'ordre compte :
 *  - le GET `./ai-review` fait foi. Il rejoue le fil entier, donc rouvrir la
 *    page au milieu d'une passe montre tout ce qui s'est déjà passé ;
 *  - le topic privé `pr-review:{id}` apporte la suite sans attendre le poll :
 *    les événements dès qu'ils sont écrits, et le texte de la synthèse pendant
 *    qu'il s'écrit (celui-là n'existe QUE là — un brouillon réémis quatre fois
 *    par seconde n'a rien à faire en base).
 *
 * Le poll reste branché tant qu'une passe tourne : c'est le filet quand un
 * message se perd ou que l'onglet dormait.
 */

const QUERY_KEY = "pr-review-session";

/** Cadence du filet pendant qu'une passe tourne. */
const ACTIVE_POLL_MS = 4000;

export interface PrReviewLive {
  /** La synthèse telle qu'elle s'écrit. */
  summary: string;
  /** Points déjà complets dans le flux du modèle. */
  findings: number;
}

interface Listener {
  onStream: (payload: { summary?: unknown; findings?: unknown; at?: unknown }) => void;
  onEvent: (row: PrReviewEvent) => void;
}

interface Entry {
  channel: RealtimeChannel | null;
  listeners: Set<Listener>;
  closed: boolean;
}

/** UN canal par session, quel que soit le nombre de vues montées dessus. */
const channels = new Map<string, Entry>();

function subscribeReview(reviewId: string, listener: Listener): () => void {
  let entry = channels.get(reviewId);
  if (!entry) {
    const fresh: Entry = { channel: null, listeners: new Set(), closed: false };
    entry = fresh;
    channels.set(reviewId, fresh);
    const supabase = getSupabase();
    // Le token AVANT le join, sinon le canal privé refuse l'abonnement.
    void supabase.realtime.setAuth().then(() => {
      if (fresh.closed) return;
      const channel = supabase.channel(prReviewTopic(reviewId), {
        config: { private: true },
      });
      channel.on("broadcast", { event: "stream" }, ({ payload }) => {
        for (const l of fresh.listeners) l.onStream((payload ?? {}) as Record<string, unknown>);
      });
      channel.on("broadcast", { event: "event" }, ({ payload }) => {
        const row = (payload as { row?: PrReviewEvent } | null)?.row;
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
    channels.delete(reviewId);
    if (opened.channel) void getSupabase().removeChannel(opened.channel);
  };
}

export function usePrReviewSession(prId: string, enabled = true) {
  const queryClient = useQueryClient();
  const [live, setLive] = useState<PrReviewLive | null>(null);
  // Deux envois partis à 250 ms d'écart peuvent arriver dans le désordre, et un
  // texte plus ancien effacerait la fin de celui déjà affiché.
  const lastAt = useRef(0);

  const queryKey = [QUERY_KEY, prId] as const;
  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchPullRequestAiReviewApi(prId),
    enabled,
    // Une passe qui tourne bouge à chaque seconde ; une passe finie ne bouge
    // plus du tout tant que personne ne relance.
    refetchInterval: (query) =>
      isPrReviewActive(query.state.data?.review ?? null) ? ACTIVE_POLL_MS : false,
  });

  const review = data?.review ?? null;
  const active = isPrReviewActive(review);
  const reviewId = active ? review?.id ?? null : null;

  useEffect(() => {
    setLive(null);
    lastAt.current = 0;
    if (!reviewId) return;

    return subscribeReview(reviewId, {
      onStream: (p) => {
        const at = typeof p.at === "number" ? p.at : 0;
        if (at < lastAt.current) return;
        lastAt.current = at;
        setLive({
          summary: typeof p.summary === "string" ? p.summary : "",
          findings: typeof p.findings === "number" ? p.findings : 0,
        });
      },
      onEvent: (row) => {
        // La synthèse publiée remplace le brouillon ; une erreur l'efface.
        if (row.type === "summary" || row.type === "error") setLive(null);
        queryClient.setQueryData<PrReviewSession>(queryKey, (old) => {
          if (!old) return old;
          if (old.events.some((e) => e.id === row.id)) return old;
          return { ...old, events: [...old.events, row].sort((a, b) => a.seq - b.seq) };
        });
        // Fin de passe : le statut, le verdict et le SHA relu vivent sur la
        // LIGNE, que le direct ne transporte pas — on va la relire. Deux
        // moments plutôt qu'un : la synthèse arrive AVANT que la ligne soit
        // close (elle est publiée d'abord), l'événement de phase `finished`
        // arrive après — c'est celui-là qui ramène le verdict et le SHA relu.
        const finished =
          row.type === "status" &&
          (row.payload as { phase?: string } | null)?.phase === "finished";
        if (row.type === "summary" || row.type === "error" || finished) void refetch();
      },
    });
    // `queryKey` est dérivé de `prId`, stable pour un même rendu du fil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewId, prId, queryClient, refetch]);

  return {
    review,
    events: data?.events ?? [],
    reviewedHeadSha: data?.reviewedHeadSha ?? null,
    model: data?.model ?? null,
    live,
    active,
    loading: isLoading,
    refetch,
  };
}
