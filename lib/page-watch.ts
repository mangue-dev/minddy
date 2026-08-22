"use client";

// WATCHING A PAGE (MIN-278 follow-up) — the heartbeat that says "this page is
// open on screen".
//
// One ping every PAGE_WATCH_PING_MS, one row in `page_viewers`, and the server
// can tell "away" from "reading": `notifyAgentPageWrite` stays silent while
// the reader watches an agent's write arrive live, and speaks again once no
// fresh row remains. The TTL (three beats) is what makes every failure cheap:
// a lost ping, a killed tab, a crashed laptop — each just goes stale, nothing
// to clean up.
//
// Like lib/page-presence.ts, the life cycle lives apart from the React hook,
// because a loop that survives its component is exactly the kind of fault only
// a mounted-then-unmounted test can see.

import { PAGE_WATCH_PING_MS } from "./pages";
import { clearPageWatchOnUnload, pingPageWatchApi } from "./pages-api";

export interface PageWatchHandle {
  /** To be called ON DISMOUNT, without exception. */
  close: () => void;
}

export function openPageWatch({
  projectId,
  pageId,
}: {
  projectId: string;
  pageId: string;
}): PageWatchHandle {
  let closed = false;

  const ping = () => {
    if (!closed) pingPageWatchApi(projectId, pageId);
  };

  // First beat immediately: opening the page must silence the line before any
  // agent write can land, not after the first interval.
  ping();
  const timer = setInterval(ping, PAGE_WATCH_PING_MS);

  return {
    close: () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      // Leaving on purpose removes the row at once rather than letting it go
      // stale — closing a page should not mute the next three minutes of
      // agent writes.
      clearPageWatchOnUnload(projectId, pageId);
    },
  };
}
