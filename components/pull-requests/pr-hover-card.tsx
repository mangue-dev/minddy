"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PullRequestPreviewFace } from "@/components/pull-requests/pr-preview-face";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { IssuePr } from "@/lib/agent-api";
import type { IssuePrReadiness } from "@/lib/issue-pr-store";
import { prPreviewChecks } from "@/lib/pr-preview-checks";
import { usePullRequestReadinessBatchQuery } from "@/lib/use-agent-runs";
import { mentionPreviewQuery, useMentionPreview } from "@/lib/use-mention-preview";

/** As for a mention (components/mention-hover-card.tsx): the card is read
    ahead once the pointer rests, before the card's own delay. */
const INTENT_MS = 150;

/**
 * Where an issue's pull request stands, while the pointer rests on its chip
 * (MIN-888): the board card's chip and the issue panel's. The title and
 * repository come from the mention preview route, read only when the card
 * is about to open; CI comes from the readiness the board already holds, and
 * is read for this PR alone only when the caller has none.
 *
 * A mouse-only addition, like every hover card: a tap on the chip still
 * opens the pull request, and a click on the card does the same.
 */
export function PullRequestHoverCard({
  pr,
  readiness,
  onOpen,
  children,
}: {
  pr: IssuePr;
  /** The board's readiness of this PR; read on open when absent. */
  readiness?: IssuePrReadiness | null;
  onOpen: () => void;
  /** The chip: one element that takes a ref. */
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const intent = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A click focuses the chip, and focus opens the card: the press keeps it
  // closed until the chip loses focus or the pointer comes back.
  const pressed = useRef(false);
  useEffect(() => () => {
    if (intent.current) clearTimeout(intent.current);
  }, []);
  const cancelIntent = () => {
    if (intent.current) clearTimeout(intent.current);
    intent.current = null;
  };
  const readAhead = () => void queryClient.prefetchQuery(mentionPreviewQuery("pull_request", pr.prId, null));
  return (
    <HoverCard open={open} onOpenChange={(next) => setOpen(next && !pressed.current)}>
      <HoverCardTrigger
        asChild
        onPointerDown={() => {
          pressed.current = true;
          cancelIntent();
          setOpen(false);
        }}
        onPointerEnter={(event) => {
          pressed.current = false;
          if (event.pointerType === "touch") return;
          cancelIntent();
          intent.current = setTimeout(readAhead, INTENT_MS);
        }}
        onPointerLeave={cancelIntent}
        onBlur={() => { pressed.current = false; }}
      >
        {children}
      </HoverCardTrigger>
      <HoverCardContent
        className="w-72 cursor-default"
        // The card is portaled, but React bubbles its events to the chip's
        // ancestors: a board card must neither open nor start a drag.
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(false);
          onOpen();
        }}
      >
        <PullRequestHoverBody pr={pr} readiness={readiness} />
      </HoverCardContent>
    </HoverCard>
  );
}

/** Mounted only while the card is open, so nothing is read before. */
function PullRequestHoverBody({ pr, readiness }: { pr: IssuePr; readiness?: IssuePrReadiness | null }) {
  const preview = useMentionPreview("pull_request", pr.prId, null, true);
  const live = pr.state === "open" || pr.state === "draft";
  const readOwn = live && !readiness?.readiness && !readiness?.unavailable;
  const own = usePullRequestReadinessBatchQuery(readOwn ? [pr.prId] : []);
  const known = readOwn
    ? own.readinessByPrId[pr.prId] ?? null
    : readiness?.unavailable ? null : readiness?.readiness ?? null;
  const data = preview.data?.type === "pull_request" ? preview.data : null;
  return (
    <PullRequestPreviewFace
      provider={data?.provider ?? null}
      repository={data?.repository ?? null}
      pending={preview.isPending}
      // The live state wins over a preview read a minute ago.
      state={pr.state}
      title={data?.title ?? null}
      number={pr.prNumber}
      checks={!live ? null : readOwn && own.loading ? "loading" : prPreviewChecks(known)}
    />
  );
}
