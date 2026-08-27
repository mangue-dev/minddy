"use client";

// The watch heartbeat hook (MIN-278 follow-up) — the React half of
// lib/page-watch.ts, and nothing more.
//
// Mounted by the page surface itself: a row in `page_viewers` means "this
// exact document is open on screen", which is the signal
// `notifyAgentPageWrite` reads before deciding to speak.

import { useEffect } from "react";

import { openPageWatch } from "./page-watch";

interface SharedPageWatch {
  refs: number;
  closeTimer: ReturnType<typeof setTimeout> | null;
  close: () => void;
}

const sharedPageWatches = new Map<string, SharedPageWatch>();

/**
 * Share the heartbeat across overlapping mounts of the same page. React Strict
 * Mode intentionally mounts, cleans up, and mounts effects again in
 * development; deferring the last release by one task prevents that probe from
 * producing POST → DELETE → POST network churn and a transient false absence.
 */
export function retainPageWatch(projectId: string, pageId: string): () => void {
  const key = `${projectId}:${pageId}`;
  const existing = sharedPageWatches.get(key);
  const watch = existing ?? {
    refs: 0,
    closeTimer: null,
    close: openPageWatch({ projectId, pageId }).close,
  };
  if (watch.closeTimer) {
    clearTimeout(watch.closeTimer);
    watch.closeTimer = null;
  }
  watch.refs += 1;
  sharedPageWatches.set(key, watch);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    watch.refs -= 1;
    if (watch.refs > 0 || watch.closeTimer) return;
    watch.closeTimer = setTimeout(() => {
      watch.closeTimer = null;
      if (watch.refs > 0) return;
      watch.close();
      sharedPageWatches.delete(key);
    }, 0);
  };
}

export function usePageWatch(
  projectId: string | null,
  pageId: string | null
): void {
  useEffect(() => {
    if (!projectId || !pageId) return;
    return retainPageWatch(projectId, pageId);
  }, [projectId, pageId]);
}
