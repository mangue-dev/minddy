"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import type {
  FeedbackVoiceDraft,
  FeedbackVoicePatch,
  FeedbackVoiceTurn,
} from "@/lib/feedback/types";

/**
 * Une session de dictée de retour, côté client — le jumeau de
 * `useIssueDictation` pour les deux composeurs de feedback (board public et
 * modal interne du dashboard).
 *
 * Elle est jetable : l'historique nourrit les commandes de suite (« ajoute
 * que… »), vit ici, et meurt avec le modal. Rien n'est persisté.
 *
 * Le TRANSPORT est injecté (`dictate`) parce que c'est la seule chose qui
 * diffère entre les deux surfaces : le board public passe par une server action
 * (session visiteur, dépense au owner), le dashboard par une route
 * authentifiée. Le reste — l'état occupé, l'historique, le run partagé avec
 * l'écoute, l'annulation — est le même des deux côtés.
 */

export type FeedbackDictationResult =
  | { ok: true; patch: FeedbackVoicePatch; reply: string }
  /** L'appelant a déjà dit l'échec à sa façon (porte OTP, quota, indispo). */
  | { ok: false; handled?: boolean };

export function useFeedbackDictation({
  dictate,
  getDraft,
  applyPatch,
}: {
  dictate: (input: {
    runId: string | null;
    transcript: string;
    draft: FeedbackVoiceDraft;
    history: FeedbackVoiceTurn[];
  }) => Promise<FeedbackDictationResult>;
  getDraft: () => FeedbackVoiceDraft;
  applyPatch: (patch: FeedbackVoicePatch) => void;
}) {
  const t = useTranslations("Dictate");
  const [busy, setBusy] = useState(false);
  const historyRef = useRef<FeedbackVoiceTurn[]>([]);
  // Le run de l'écoute qui vient d'avoir lieu : le repasser au rangement range
  // les deux appels sous une seule ligne du ledger. Consommé une fois.
  const runIdRef = useRef<string | null>(null);
  const abortedRef = useRef(false);

  const run = async (transcript: string) => {
    if (!transcript.trim()) return;
    const runId = runIdRef.current;
    runIdRef.current = null;
    setBusy(true);
    abortedRef.current = false;
    try {
      const result = await dictate({
        runId,
        transcript,
        draft: getDraft(),
        history: historyRef.current,
      });
      if (abortedRef.current) return;
      if (!result.ok) {
        if (!result.handled) toast.error(t("error"));
        return;
      }
      applyPatch(result.patch);
      historyRef.current = [
        ...historyRef.current,
        { role: "user" as const, content: transcript },
        { role: "assistant" as const, content: result.reply },
      ].slice(-12);
      // Les champs qui bougent SONT le retour visuel : la phrase de Numo ne
      // s'affiche que quand rien n'a bougé (commande comprise de travers, ou
      // rien à changer), sinon elle double ce qu'on voit déjà.
      if (Object.keys(result.patch).length === 0 && result.reply) {
        toast.info(result.reply);
      }
    } catch (err) {
      if (abortedRef.current) return;
      console.error("[feedback-dictation] failed", err);
      toast.error(t("error"));
    } finally {
      if (!abortedRef.current) setBusy(false);
    }
  };

  // Le DictateButton capture son callback au démarrage de l'enregistrement :
  // on route par une ref pour que l'appel lise TOUJOURS l'état courant du
  // formulaire (le clic sur le micro blure aussi l'éditeur, qui committe juste
  // avant la prise).
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  const onTranscript = useCallback((text: string) => void runRef.current(text), []);

  /** Mémorise le run de l'écoute — à appeler depuis `uploadAudio`. */
  const noteRun = useCallback((runId: string | null) => {
    runIdRef.current = runId;
  }, []);

  /** Jette la session entière : historique, run en attente, appel en vol. */
  const reset = useCallback(() => {
    historyRef.current = [];
    runIdRef.current = null;
    abortedRef.current = true;
    setBusy(false);
  }, []);

  return { busy, onTranscript, noteRun, reset };
}
