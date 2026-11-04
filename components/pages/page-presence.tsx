"use client";

// THE AVATARS OF PRESENCE (MIN-271) — who else is reading this page, right now.
//
// This is the PREVENTIVE half of the feature: the versioned backup catches up
// the collision once it has occurred, the avatar at the top of the page avoids it. There
// person who sees someone else on their document does not behave like that
// same way — and this is precisely what a shared document never says everything
// seul.
//
// You do NOT show yourself: the only face a user is not looking for
// not on his own screen is his, and leaving it would make it seem like two
// readers where there is only one. The sorting is done at the SOURCE, once for
// all surfaces (lib/page-presence.ts) — the tree doesn't even know
// who I am, and he placed his tablet on my own second tab.

import { createContext, useContext, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

import { usePagePresence } from "@/lib/use-page-presence";

import type { PagePresenceMap } from "@/lib/page-presence";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// The faces live apart so read-only surfaces can draw them without the channel.
export { PagePresence } from "./page-presence-faces";

/* ── The channel, mounted ONCE ────────────────────── ────────────────────── */

const EMPTY: PagePresenceMap = new Map();
const PresenceContext = createContext<PagePresenceMap>(EMPTY);

/**
 * The subscription lives in the SHELL of the pages, not in the open page.
 *
 * The shell crosses document selections, so changing pages only updates its
 * tracked page. Document Activities suspend their effects, and large or draft
 * surfaces can unmount without tearing down the project's presence channel.
 */
export function PagePresenceProvider({
  projectId,
  pageId,
  children,
}: {
  projectId: string;
  pageId: string | null;
  children: ReactNode;
}) {
  const present = usePagePresence(projectId, pageId);
  return (
    <PresenceContext.Provider value={present}>
      {children}
    </PresenceContext.Provider>
  );
}

/** Others present on a given page. */
export function usePresentOn(pageId: string | null): string[] {
  const present = useContext(PresenceContext);
  return (pageId ? present.get(pageId) : undefined) ?? [];
}

/**
 * The tree PELLET: a page that someone else is looking at at the moment.
 *
 * A point, not an avatar: the tree line is already dense (icon, title,
 * chevron, `+` button), and the useful information there is binary —
 * “there is someone”. Which, we read it when opening the page.
 */
export function PagePresenceDot({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  const t = useTranslations("Pages");
  if (count <= 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={t("presenceCount", { count })}
          className={cn(
            "size-1.5 shrink-0 rounded-full bg-emerald-500",
            className
          )}
        />
      </TooltipTrigger>
      <TooltipContent>{t("presenceCount", { count })}</TooltipContent>
    </Tooltip>
  );
}
