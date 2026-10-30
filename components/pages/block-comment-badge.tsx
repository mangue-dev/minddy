"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Message01Icon } from "@hugeicons/core-free-icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GUTTER_BUTTON } from "@/components/pages/block-chrome-geometry";

export function BlockCommentBadge({
  blockId,
  count,
  label,
  onOpen,
}: {
  blockId: string;
  count: number;
  label: string;
  onOpen: (blockId: string) => void;
}) {
  // The badge is mounted in a React root of its own (a ProseMirror widget,
  // blocks/block-comments.ts), outside the app's tooltip provider: without
  // one here the tooltip threw and the badge never rendered.
  return (
    <TooltipProvider>
    <Tooltip delayDuration={600} disableHoverableContent>
      <TooltipTrigger asChild>
        <button
          type="button"
          // The new-comment button's twin (block-gutter.tsx): same button,
          // same size, the count in its corner.
          className={cn(GUTTER_BUTTON, "page-block-comment-badge relative size-6")}
          data-block-id={blockId}
          aria-label={label}
          contentEditable={false}
          onMouseDown={(event) => {
            // Preserve the ProseMirror selection while opening the discussion.
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(blockId);
          }}
        >
          <HugeiconsIcon icon={Message01Icon} className="size-5" aria-hidden />
          <span className="page-block-comment-count">{count}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
}
