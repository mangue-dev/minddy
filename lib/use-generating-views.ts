"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface ViewStamp { id: string; updated_at: string }
interface PendingView { updatedAt: string; expiresAt: number }

/** Preserve deadlines while Activity pauses effects, without hidden timers. */
export function useGeneratingViews(views: ViewStamp[], timeoutMs = 120_000) {
  const [pending, setPending] = useState<Record<string, PendingView>>({});
  const beginGenerating = useCallback((view: ViewStamp) => {
    setPending((previous) => ({ ...previous, [view.id]: { updatedAt: view.updated_at, expiresAt: Date.now() + timeoutMs } }));
  }, [timeoutMs]);
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finished: string[] = [];
    const now = Date.now();
    const remove = (ids: string[]) => setPending((previous) => {
      if (!ids.some((id) => id in previous)) return previous;
      const next = { ...previous };
      for (const id of ids) delete next[id];
      return next;
    });
    for (const [id, task] of Object.entries(pending)) {
      const view = views.find((candidate) => candidate.id === id);
      if (!view || view.updated_at !== task.updatedAt || task.expiresAt <= now) finished.push(id);
      else timers.push(setTimeout(() => remove([id]), task.expiresAt - now));
    }
    if (finished.length) remove(finished);
    return () => timers.forEach(clearTimeout);
  }, [pending, views]);
  const generatingViewIds = useMemo(() => new Set(Object.keys(pending)), [pending]);
  return { generatingViewIds, beginGenerating };
}
