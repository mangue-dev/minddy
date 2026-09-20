"use client";

// Search in the CONTENT of the pages, for ⌘K (MIN-276).
//
// The titles are already in the browser: `/api/me/search-index` them
// load once per tab, and the palette filters them when typing without a
// round trip. BODIES cannot follow this path — send the wiki of
// all my projects to be able to search it on the client side, it's paying for the wiki
// integer each time a tab is opened.
//
// So they look for each other on the server side, and all the care is in the rhythm:
//
// - the request follows the typing with a delay (DEBOUNCE_MS): the line
// by title, it appears immediately - this is the order that is necessary, the
// search by content ENRICHES an already useful list rather than making it
//   wait;
// - below MIN_QUERY characters, nothing leaves: “a” would bring back the
// half the wiki for a typo that is not yet a question;
// - the result is cached by query (react-query), so clear one
// character then retyping it doesn't ask anything again.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePaletteStore } from "@/lib/command-palette";

import type { PageSearchHit } from "./types";
import { pageContentSearchQuery } from "./page-content-search-query";

/** Below this threshold, a strike is still not a question. */
const MIN_QUERY = 2;
/** The delay on typing. Enough so as not to draw at each letter, enough few
 * so that the result arrives while reading the list of titles. */
const DEBOUNCE_MS = 220;
const EMPTY_HITS: PageSearchHit[] = [];

/**
 * Pages whose CONTENT meets what is typed in ⌘K, all projects
 * combined. Empty as long as the palette is closed: it returns nothing, and the
 * request would have no one to serve.
 */
export function usePageContentSearch(enabled: boolean): PageSearchHit[] {
  // Closed palettes do not need to notify the application shell about typing.
  const query = usePaletteStore((s) => enabled ? s.query : "");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    if (!enabled) {
      setDebounced("");
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY) {
      setDebounced("");
      return;
    }
    const timer = setTimeout(() => setDebounced(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, enabled]);

  const { data } = useQuery({
    ...pageContentSearchQuery(debounced),
    enabled: enabled && debounced.length >= MIN_QUERY,
    // Keep useful snippets while the next debounced request is in flight.
    placeholderData: (previous) => previous,
  });

  return enabled && query.trim().length >= MIN_QUERY ? data ?? EMPTY_HITS : EMPTY_HITS;
}
