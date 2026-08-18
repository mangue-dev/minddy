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
 * A feedback dictation session, client side — the twin of
 *`useIssueDictation` for the two feedback composers (public board and
 * internal dashboard modal).
 *
 * It is disposable: the history feeds the follow-up commands (" adds
 * that..."), lives here, and dies with the modal. Nothing is persisted.
 *
 * TRANSPORT is injected (`dictate`) because it is the only thing that
 * differs between the two surfaces: the public board goes through a server action
 * (visitor session, spend to owner), the dashboard through one route
 * authenticated. The rest — busy state, history, run shared with
 * listening, canceling — is the same on both sides.
 */

export type FeedbackDictationResult =
  | { ok: true; patch: FeedbackVoicePatch; reply: string }
  /** The caller has already said the failure in his own way (OTP door, quota, unavailable). */
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
  // The listening run that has just taken place: put it back in storage
  // both calls under a single ledger line. Consumed once.
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
      // The fields that move ARE the visual feedback: Numo's sentence does not
      // is only displayed when nothing has moved (command understood incorrectly, or
      // nothing to change), otherwise it doubles what we already see.
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

  // The DictateButton captures its callback when recording starts:
  // we route through a ref so that the call ALWAYS reads the current state of the
  // form (clicking on the micro also blurs the editor, which just commits
  // before taking).
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  const onTranscript = useCallback((text: string) => void runRef.current(text), []);

  /** Stores the listener run — to be called from `uploadAudio`. */
  const noteRun = useCallback((runId: string | null) => {
    runIdRef.current = runId;
  }, []);

  /** Discard the entire session: history, pending run, in-flight call. */
  const reset = useCallback(() => {
    historyRef.current = [];
    runIdRef.current = null;
    abortedRef.current = true;
    setBusy(false);
  }, []);

  return { busy, onTranscript, noteRun, reset };
}
