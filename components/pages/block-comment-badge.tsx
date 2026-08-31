"use client";

import { MessageSquare } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
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
  return (
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
          <MessageSquare aria-hidden />
          <span>{count}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
