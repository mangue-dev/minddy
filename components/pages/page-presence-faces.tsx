"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display-name";
import type { Member } from "@/lib/types";

/**
 * The faces of the people present on a page (MIN-271), drawn from plain
 * props. `page-presence.tsx` re-exports it next to the realtime channel it
 * does not need.
 */

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
