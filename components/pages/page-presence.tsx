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
import { cn } from "mangue-ui";

import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display-name";
import { usePagePresence } from "@/lib/use-page-presence";
import type { PagePresenceMap } from "@/lib/page-presence";
import type { Member } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/* ── The channel, mounted ONCE ────────────────────── ────────────────────── */

const EMPTY: PagePresenceMap = new Map();
const PresenceContext = createContext<PagePresenceMap>(EMPTY);

/**
 * The subscription lives in the SHELL of the pages, not in the open page.
 *
 * This is what makes it stick: `PageView` rewinds on each navigation
 * (`key={pageId}`), so putting the channel there would make it quit and rejoin at
 * every click in the tree — and flash in everyone. The shell,
 * crosses navigations; changing pages is just another `track`.
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

/** Anything OTHERS look at in the project — the tree needs it in full
. */
export function usePresentPages(): PagePresenceMap {
  return useContext(PresenceContext);
}

/** Others present on a given page. */
export function usePresentOn(pageId: string | null): string[] {
  const present = useContext(PresenceContext);
  return (pageId ? present.get(pageId) : undefined) ?? [];
}

/** Beyond that, we count: five faces at the top of a document, it's already a
 toolbar. */
const MAX_FACES = 3;

export function PagePresence({
  userIds,
  members,
  className,
}: {
  /** OTHERS present on this page — already sorted (lib/page-presence.ts). */
  userIds: readonly string[];
  members: readonly Member[];
  className?: string;
}) {
  const t = useTranslations("Pages");
  const others = userIds;
  if (others.length === 0) return null;

  const byId = new Map(members.map((member) => [member.user_id, member]));
  const faces = others.slice(0, MAX_FACES);
  const extra = others.length - faces.length;

  return (
    <div className={cn("flex items-center", className)}>
      {faces.map((id) => {
        const member = byId.get(id);
        // A present that we don't know (member added since loading
        // from the list) keeps its place: a neutral avatar is better than a
        // lecteur invisible.
        const name = member ? displayName(member) : t("presenceUnknown");
        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <span className="-ml-1.5 first:ml-0">
                <UserAvatar
                  seed={member?.avatar_seed ?? null}
                  className="size-5 ring-2 ring-background"
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>{t("presenceHere", { name })}</TooltipContent>
          </Tooltip>
        );
      })}
      {extra > 0 && (
        <span className="-ml-1.5 flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background">
          +{extra}
        </span>
      )}
    </div>
  );
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
