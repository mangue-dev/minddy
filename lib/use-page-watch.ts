"use client";

// The watch heartbeat hook (MIN-278 follow-up) — the React half of
// lib/page-watch.ts, and nothing more.
//
// Mounted by the page surface itself: a row in `page_viewers` means "this
// exact document is open on screen", which is the signal
// `notifyAgentPageWrite` reads before deciding to speak.

import { useEffect } from "react";

import { openPageWatch } from "./page-watch";

export function usePageWatch(
  projectId: string | null,
  pageId: string | null
): void {
  useEffect(() => {
    if (!projectId || !pageId) return;
    const opened = openPageWatch({ projectId, pageId });
    return () => opened.close();
  }, [projectId, pageId]);
}
