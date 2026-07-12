"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteDraft,
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
  const [all, setAll] = useState<DraftFor<K>[]>(() => readDrafts(kind));

  useEffect(() => {
    if (active) setAll(readDrafts(kind));
  }, [active, kind]);

  const drafts = useMemo(
    () => (projectId ? all.filter((d) => d.projectId === projectId) : []),
    [all, projectId]
  );

  const save = useCallback(
    (draft: DraftFor<K>) => setAll(upsertDraft(kind, draft)),
    [kind]
  );

  const remove = useCallback(
    (id: string) => setAll(deleteDraft(kind, id)),
    [kind]
  );

  const find = useCallback(
    (id: string) => all.find((d) => d.id === id) ?? null,
    [all]
  );

  return { drafts, save, remove, find };
}
