"use client";

// Where a mention leads, for the surface that renders it — and nothing more.
//
// Same breakdown as the subpage lookup (components/pages/pages-lookup):
// the pill is rendered by a node view, at the very bottom of the editor, and it
// has no way of fetching the draft of a cited ticket herself. She
// REQUEST, to whom already has the sources of the mentions (lib/use-mention-sources).
//
// The URL rule is not here: it is in lib/mention-target.ts,
// pure module, shared with other inputs to the same screens.

import { createContext, useContext, type ReactNode } from "react";
import type { MentionTargetType } from "@/lib/mention-target";

export interface MentionLinks {
  /**
 * The address of a mention, or `null` — either it leads nowhere (a
 * person), or the cited item is not (yet) resolved. The pill
 * then remains text: better than opening a false URL.
 */
  href: (type: MentionTargetType, id: string) => string | null;
  /**
 * Handle an ordinary click. Issues open in the app-wide side panel without
 * leaving the current page; other linked entities use client-side routing.
 * `href` remains separate so modified clicks and browser context menus keep a
 * canonical destination.
 */
  navigate: (type: MentionTargetType, id: string) => void;
}

const Context = createContext<MentionLinks | null>(null);

export function MentionLinksProvider({
  value,
  children,
}: {
  value: MentionLinks | null;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** `null` = surface without destinations: the pills go there, they don't click there. */
export function useMentionLinks(): MentionLinks | null {
  return useContext(Context);
}
