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
 * Foldable sequence of the work of a TOUR, shared by the Numo chat and the thread of
 * the code agent — one mechanic, one appearance:
 * • ACTIVE → open by default, “Working from X” header which counts live.
 * • finished → the header changes to “Worked for
 * closes automatically (remains foldable/unfoldable by hand).
 *
 * The caller returns the ANSWER to the trick just below: the reader follows the work
 * in progress, then reads the final message, instead of receiving the turn of a block.
 *
 * To be mounted with a STABLE `key` between the active state and the finished state of the same turn:
 * This is the same instance that plays the closing animation.
 *
 * The labels live in the i18n namespace `Agent`: a single source for the
 * deux surfaces.
 */
export function WorkAccordion({
  startedAt,
  endedAt,
  active,
  children,
}: {
  /** ISO — start of the round. */
  startedAt: string;
  /** ISO — end of the turn; `null` while it is working. */
  endedAt: string | null;
  active: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("Agent");

  // Open by default as long as it WORKS; closes automatically when
  // work transition → completed, while remaining foldable by hand.
  // A turn that RESUMES after a pause (an answered ask_user re-activates the
  // same instance) unfolds again, so the reader keeps following the work.
  const [open, setOpen] = useState(active);
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) setOpen(false);
    if (!wasActive.current && active) setOpen(true);
    wasActive.current = active;
  }, [active]);

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
