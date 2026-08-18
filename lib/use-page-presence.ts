"use client";

// The pages PRESENCE hook (MIN-271) — the React half of
// lib/page-presence.ts, and nothing more.
//
// It is mounted ONCE, by the shell of the pages, and not by each page
// open: the channel is that of the project, and the tree needs the complete state
// to place your tablets. Opening another page therefore doesn't do anything — it's
// one more `track` on the channel already there.

import { useEffect, useRef, useState } from "react";

import { useAuth } from "./auth-context";
import {
  openPagePresence,
  type PagePresenceHandle,
  type PagePresenceMap,
} from "./page-presence";

const EMPTY: PagePresenceMap = new Map();

/**
 * Who ELSE looks at what in this project — `pageId` → the ids of the presents.
 * Never me, not even from another tab: sorting is done at the source
 * (lib/page-presence.ts).
 */
export function usePagePresence(
  projectId: string | null,
  pageId: string | null
): PagePresenceMap {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [present, setPresent] = useState<PagePresenceMap>(EMPTY);
  const handle = useRef<PagePresenceHandle | null>(null);
  // The open page, READ when the channel opens rather than captured: it does not
  // is not part of what decides to join.
  const open = useRef(pageId);
  open.current = pageId;

  // The channel does NOT depend on the page: joining it each time you browse would
  // one socket round trip per click in the tree, and the avatar would flash
  // at everyone's house every time. `on` is “a page is open” — on
  // the list, there is no one to declare and nothing to display.
  const on = !!projectId && !!userId && !!pageId;
  useEffect(() => {
    if (!on || !projectId || !userId || !open.current) {
      setPresent(EMPTY);
      return;
    }
    const opened = openPagePresence({
      projectId,
      userId,
      pageId: open.current,
      onChange: setPresent,
    });
    handle.current = opened;
    return () => {
      handle.current = null;
      opened.close();
      setPresent(EMPTY);
    };
  }, [on, projectId, userId]);

  useEffect(() => {
    if (pageId) handle.current?.move(pageId);
  }, [pageId]);

  return present;
}
