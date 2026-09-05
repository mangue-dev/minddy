"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNow, useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "mangue-ui";
import { ChevronRight } from "lucide-react";

/**
 * Shared turn accordion for the assistant and agent feeds. Active turns stay open
 * with a live timer; completed turns close unless they contain a live credential.
 * Keep its key stable so completion animates without remounting the work.
 */
export function WorkAccordion({
  startedAt,
  endedAt,
  active,
  revealKey,
  children,
}: {
  /** ISO — start of the round. */
  startedAt: string;
  /** ISO — end of the turn; `null` while it is working. */
  endedAt: string | null;
  active: boolean;
  /** Keep newly received one-time credentials visible when the turn finishes. */
  revealKey?: string;
  children: ReactNode;
}) {
  const t = useTranslations("Agent");

  // Open by default as long as it WORKS; closes automatically when
  // work transition → completed, while remaining foldable by hand.
  // A turn that RESUMES after a pause (an answered ask_user re-activates the
  // same instance) unfolds again, so the reader keeps following the work.
  const [open, setOpen] = useState(active || Boolean(revealKey));
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active && !revealKey) setOpen(false);
    if (!wasActive.current && active) setOpen(true);
    if (revealKey) setOpen(true);
    wasActive.current = active;
  }, [active, revealKey]);

  // Chrono: live count (1 s tick) while active, otherwise fixed duration.
  const now = useNow({ updateInterval: active ? 1000 : undefined });
  const startMs = Date.parse(startedAt);
  const safeStart = Number.isNaN(startMs) ? now.getTime() : startMs;
  const ms = active
    ? Math.max(0, now.getTime() - safeStart)
    : Math.max(0, Date.parse(endedAt ?? startedAt) - safeStart);
  const totalSec = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const label = active
    ? minutes > 0
      ? t("workingSinceMinutes", { minutes, seconds })
      : t("workingSinceSeconds", { seconds })
    : minutes > 0
      ? t("workedForMinutes", { minutes, seconds })
      : t("workedForSeconds", { seconds });

  return (
    <Collapsible open={open} onOpenChange={active ? undefined : setOpen}>
      {active ? (
        <div className="flex w-full items-center pb-2.5 text-xs font-medium text-muted-foreground">
          <span className="text-shimmer">{label}</span>
        </div>
      ) : (
        <CollapsibleTrigger className="group flex w-full items-center gap-1.5 pb-2.5 text-xs font-medium text-muted-foreground outline-hidden transition-colors hover:text-foreground">
          <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
          <span>{label}</span>
        </CollapsibleTrigger>
      )}
      {/* Full-width fixed border under the toggle: separates the indicator from the
 messages. Always visible (open as closed), it does not move —
 the content animates below. */}
      <div className="border-t border-border" />
      <CollapsibleContent>
        <div className="flex flex-col gap-3 pt-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
