"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { MentionHoverProps } from "@/components/mention-hover";
import { cn } from "@/lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { isPreviewMentionType, type PreviewMentionType } from "@/lib/mention-preview";
import { mentionPreviewQuery, useMentionPreview } from "@/lib/use-mention-preview";

/** The card bodies, kept out of every route until a card is about to open. */
const loadCards = () => import("@/components/mention-preview-cards");
const MentionPreviewCard = lazy(() => loadCards().then((cards) => ({ default: cards.MentionPreviewCard })));

/**
 * How long the pointer rests on a mention before its card is read ahead.
 * Shorter than the card's own delay (components/ui/hover-card.tsx), so the
 * answer is usually there when it opens; long enough that a pointer crossing
 * a paragraph of mentions reads none of them.
 */
const INTENT_MS = 150;

/**
 * More about a mentioned target while the pointer rests on it (MIN-879): the
 * issue's board card, an objective as its row shows it, the first lines of a
 * page, a database's first rows, a person's account and role. Read only when
 * the card opens, and only what the reader may open: the server answers
 * `null` otherwise, and the card then says nothing more than the pill.
 *
 * A type without a card (a date, a resource) returns its trigger untouched.
 * The trigger must be one element that takes a ref. Callers render it through
 * `MentionHover` (components/mention-hover.tsx), which the signed-in app
 * points here.
 */
export function MentionHoverCard({
  type,
  id,
  meta,
  project = null,
  side = "bottom",
  align = "start",
  disabled = false,
  onOpen,
  children,
}: MentionHoverProps) {
  const [open, setOpen] = useState(false);
  // Whatever element the trigger is (a link, a span, an SVG group).
  const trigger = useRef<HTMLAnchorElement | null>(null);
  const queryClient = useQueryClient();
  const intent = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A press focuses the trigger, and focus opens a card after its delay: a
  // click on a pill would reopen the card it just closed, once the pointer
  // is gone, and keep it open while the trigger keeps focus. The press holds
  // it closed until the trigger loses focus or the pointer comes back;
  // keyboard focus still opens it.
  const pressed = useRef(false);
  useEffect(() => () => {
    if (intent.current) clearTimeout(intent.current);
  }, []);
  if (!isPreviewMentionType(type)) return children;
  const target = { type, id, project: type === "skill" ? meta?.project ?? null : project };
  // Read the card ahead once the pointer rests: its body's code and its
  // data, so it opens with both. A touch opens no card, so reads nothing.
  const readAhead = () => {
    void loadCards();
    void queryClient.prefetchQuery(mentionPreviewQuery(target.type, target.id, target.project));
  };
  const cancelIntent = () => {
    if (intent.current) clearTimeout(intent.current);
    intent.current = null;
  };
  // Without an action of its own, a click on the card clicks the trigger:
  // a pill's link then navigates exactly as it would.
  const activate = (event: React.MouseEvent) => {
    // The card is portaled, but React bubbles its clicks to the trigger's
    // ancestors: a pill on a board card must not also open that card.
    event.stopPropagation();
    setOpen(false);
    if (onOpen) onOpen();
    else trigger.current?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  };
  return (
    <HoverCard open={open && !disabled} onOpenChange={(next) => setOpen(next && !disabled && !pressed.current)}>
      {/* Pressing the trigger acts on it (a link, a picker): the card goes. */}
      <HoverCardTrigger
        asChild
        ref={trigger}
        onPointerDown={() => {
          pressed.current = true;
          cancelIntent();
          setOpen(false);
        }}
        onPointerEnter={(event) => {
          pressed.current = false;
          if (event.pointerType === "touch" || disabled) return;
          cancelIntent();
          intent.current = setTimeout(readAhead, INTENT_MS);
        }}
        onPointerLeave={cancelIntent}
        onFocus={() => { if (!disabled && !pressed.current) readAhead(); }}
        onBlur={() => { pressed.current = false; }}
      >
        {children}
      </HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        // The issue card brings its own surface, as on the board.
        className={type === "issue" ? "w-80 bg-transparent p-0 shadow-none ring-0" : undefined}
      >
        {/* A click on the card does what a click on the mention does. */}
        <div className="cursor-default" onClick={activate}>
          <MentionPreviewBody type={target.type} id={target.id} project={target.project} open={open} />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function MentionPreviewBody({
  type,
  id,
  project,
  open,
}: {
  type: PreviewMentionType;
  id: string;
  project: string | null;
  open: boolean;
}) {
  const t = useTranslations("MentionPreview");
  const query = useMentionPreview(type, id, project, open);
  const loading = (
    <div className={cn("flex flex-col gap-2", type === "issue" && "rounded-2xl bg-popover p-3 shadow-md ring-1 ring-border")}
      aria-busy="true" aria-label={t("loading")}>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  );
  if (query.isPending) return loading;
  if (!query.data) {
    return (
      <p className={cn("text-xs text-muted-foreground", type === "issue" && "rounded-2xl bg-popover p-3 shadow-md ring-1 ring-border")}>
        {t("unavailable")}
      </p>
    );
  }
  return (
    <Suspense fallback={loading}>
      <MentionPreviewCard preview={query.data} />
    </Suspense>
  );
}
