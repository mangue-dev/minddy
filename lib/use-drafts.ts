"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useAuth } from "./auth-context";
import {
  deleteDraft,
  LegacyDraftRecoveryRequired,
  readDrafts,
  upsertDraft,
  type DraftFor,
  type DraftKind,
} from "@/lib/drafts";

/**
 * Reactive access to the local draft store (MIN-41) for one create dialog.
 *
 * The dialogs stay mounted for reuse, so the hook re-reads localStorage each
 * time `active` (the dialog's `open`) flips true — that picks up drafts saved
 * by the other mounted instance (the global create dialog vs. the project
 * board's own) or in a previous session. `drafts` is filtered to `projectId`,
 * since a draft is only meaningful inside the project it was written in.
 */
export function useDrafts<K extends DraftKind>(
  kind: K,
  projectId: string | null,
  active: boolean
) {
  const t = useTranslations("Drafts");
  const { user } = useAuth();
  const [all, setAll] = useState<DraftFor<K>[]>([]);
  const [legacyAvailable, setLegacyAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAll([]); setLegacyAvailable(false);
    if (active) void readDrafts(kind).then((drafts) => {
      if (!cancelled) setAll(drafts);
    }).catch((error) => {
      if (!cancelled) {
        if (error instanceof LegacyDraftRecoveryRequired) setLegacyAvailable(true);
        else toast.error(t("restoreFailed"));
      }
    });
    return () => { cancelled = true; };
  }, [active, kind, user?.id, t]);

  const drafts = useMemo(
    () => (projectId ? all.filter((d) => d.projectId === projectId) : []),
    [all, projectId]
  );

  const save = useCallback(
    async (draft: DraftFor<K>) => setAll(await upsertDraft(kind, draft)),
    [kind]
  );

  const remove = useCallback(
    async (id: string) => {
      try { setAll(await deleteDraft(kind, id)); return true; }
      catch { toast.error(t("deleteFailed")); return false; }
    },
    [kind, t]
  );

  const find = useCallback(
    (id: string) => all.find((d) => d.id === id) ?? null,
    [all]
  );

  const recoverLegacy = async () => {
    try { setAll(await readDrafts(kind, true)); setLegacyAvailable(false); }
    catch { toast.error(t("restoreFailed")); }
  };
  return { drafts, save, remove, find, legacyAvailable, recoverLegacy };
}
