"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Message01Icon } from "@hugeicons/core-free-icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
    <Tooltip delayDuration={400} disableHoverableContent>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="page-block-comment-badge"
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
          <HugeiconsIcon icon={Message01Icon} aria-hidden />
          <span>{count}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
}
