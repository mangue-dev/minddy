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
import type { MentionMeta } from "@/lib/mention-link";
import type { IssueStatus } from "@/lib/issue-constants";
import {
  OBJECTIVE_STATUS_MAP,
  type ObjectiveStatus,
} from "@/lib/objective-constants";

export interface MentionLinks {
  /**
 * The address of a mention, or `null` — either it leads nowhere (a
 * person), or the cited item is not (yet) resolved. The pill
 * then remains text: better than opening a false URL.
 */
  href: (type: MentionTargetType, id: string) => string | null;
  /** Current issue state when this mention source has resolved the ticket. */
  issueStatus: (id: string) => IssueStatus | null;
  /** The ticket's title when this source holds it: an issue pill names the
      ticket by its identifier, and shows its title on hover. */
  issueTitle?: (id: string) => string | null;
  /** Current objective state when this source holds the objective (MIN-785). */
  objectiveStatus?: (id: string) => ObjectiveStatus | null;
  /**
 * Handle an ordinary click. Issues open in the app-wide side panel without
 * leaving the current page; other linked entities use client-side routing.
 * `href` remains separate so modified clicks and browser context menus keep a
 * canonical destination.
 */
  navigate: (type: MentionTargetType, id: string) => void;
  /**
   * The current label of a target these sources already hold (MIN-734), or
   * `null` when they do not: the pill then asks the server, which answers
   * only for what the reader may see.
   */
  label?: (type: MentionTargetType, id: string, meta?: MentionMeta) => string | null;
  /** A second line for a pill's tooltip: a skill's description. */
  detail?: (type: MentionTargetType, id: string, meta?: MentionMeta) => string | null;
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

/**
 * The status glyph a pill shows, as the issue status whose indicator draws it:
 * an issue's own, or the one an objective state borrows. `null` when the
 * sources do not hold the target, or for a type without status.
 */
export function mentionStatus(
  links: MentionLinks | null,
  type: string,
  id: string,
): IssueStatus | null {
  if (type === "issue") return links?.issueStatus(id) ?? null;
  if (type !== "objective") return null;
  const status = links?.objectiveStatus?.(id);
  return status ? OBJECTIVE_STATUS_MAP[status].issueStatus : null;
}

/** `null` = surface without destinations: the pills go there, they don't click there. */
export function useMentionLinks(): MentionLinks | null {
  return useContext(Context);
}
