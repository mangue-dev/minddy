"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import type {
  IssueEffort,
  IssuePriority,
  IssueStatus,
} from "@/lib/issue-constants";
import type { IssueDraftPatch } from "@/lib/types";

type DictateTurn = { role: "user" | "assistant"; content: string };

/** Snapshot of the form/issue Numo reasons over — mirrors the route's Draft. */
export interface DictationDraft {
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  effort: IssueEffort | null;
  assignee_id: string | null;
  objective_id: string | null;
  due_date: string | null;
  category_ids: string[];
}

/** Numo emits due dates as naive local datetimes ("2026-07-10T00:00:00") —
 *  interpret them in the browser's timezone and store the usual ISO instant
 *  (local midnight = date-only, matching the DateTimePicker convention). */
function normalizeDueDate(value: string | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * One voice-dictation session against /api/projects/[id]/dictate-issue: sends
 * each transcript with the current draft, applies the returned field patch.
 * The session is throwaway — history feeds Numo's follow-up commands, lives
 * here, and nothing is persisted.
 */
export function useIssueDictation({
  projectId,
  mode,
  getDraft,
  applyPatch,
  smartFill = false,
}: {
  projectId: string;
  /** "create" fills the new-issue form; "edit" edits an existing issue. */
  mode: "create" | "edit";
  getDraft: () => DictationDraft;
  applyPatch: (patch: IssueDraftPatch) => void;
  /**
   * Smart-fill est armé sur le formulaire (MIN-260) : la route retire alors
   * priorité, effort, catégories et objectif du tool, donc la dictée ne les
   * pose plus — c'est Smart-fill qui les posera à la création. Lu à CHAQUE
   * envoi et pas figé à l'ouverture : la bascule peut changer entre deux prises.
   */
  smartFill?: boolean;
}) {
  const t = useTranslations("IssueUI");
  const [busy, setBusy] = useState(false);
  const historyRef = useRef<DictateTurn[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const dictate = async (transcript: string) => {
    // An empty transcript carries no instruction — never enter the Numo step.
    if (!transcript.trim()) return;
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`/api/projects/${projectId}/dictate-issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          mode,
          draft: getDraft(),
          smartFill,
          history: historyRef.current,
          // Numo returns naive local datetimes; normalizeDueDate interprets
          // them in the browser's timezone.
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(t("dictateFailed"));
      const data = (await res.json()) as {
        patch: IssueDraftPatch;
        reply: string;
      };
      applyPatch(
        data.patch.due_date !== undefined
          ? { ...data.patch, due_date: normalizeDueDate(data.patch.due_date) }
          : data.patch,
      );
      historyRef.current = [
        ...historyRef.current,
        { role: "user" as const, content: transcript },
        { role: "assistant" as const, content: data.reply },
      ].slice(-12);
      // Fields moving are the feedback; surface Numo's reply only when nothing
      // visibly changed (unknown name, unclear command…).
      if (Object.keys(data.patch).length === 0 && data.reply)
        toast.info(data.reply);
    } catch (err) {
      if ((err as Error).name !== "AbortError") toast.error(t("dictateFailed"));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  };
  // The DictateButton captures its callback when recording starts; route the
  // call through a ref so it always reads the current form state (a mic click
  // also blurs the description editor, committing it just before recording).
  const dictateRef = useRef(dictate);
  useEffect(() => {
    dictateRef.current = dictate;
  });
  const onTranscript = useCallback(
    (text: string) => void dictateRef.current(text),
    [],
  );

  /** Forget the conversation — a follow-up recording starts fresh (the issue
   *  was just created, or a different one opened). */
  const clearHistory = useCallback(() => {
    historyRef.current = [];
  }, []);

  /** Drop the whole session: history + any in-flight request. */
  const reset = useCallback(() => {
    historyRef.current = [];
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }, []);

  return { busy, onTranscript, clearHistory, reset };
}
