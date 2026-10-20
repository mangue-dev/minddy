"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useTooltipScope,
} from "./tooltip";

/** Whether CSS truncation (`truncate` or `line-clamp-*`) hides part of the text. */
export function isTextCut(element: HTMLElement): boolean {
  return (
    element.scrollWidth > element.clientWidth + 1 ||
    element.scrollHeight > element.clientHeight + 1
  );
}

/**
 * Text that CSS may cut (MIN-724). When it is cut, hovering or focusing it
 * shows the full text in a tooltip; when it fits, nothing opens, so a short
 * title never repeats itself. `className` carries the truncation itself
 * (`truncate` when omitted; pass `line-clamp-2` and the like, along with the
 * text styles, to clamp several lines).
 */
export function TruncatedText({
  text,
  className,
  children,
  side,
}: {
  /** The full text, shown in the tooltip. */
  text: string;
  className?: string;
  /** What is rendered in place, when it differs from `text` (highlights). */
  children?: React.ReactNode;
  side?: React.ComponentProps<typeof TooltipContent>["side"];
}) {
  const scope = useTooltipScope();
  const ref = React.useRef<HTMLSpanElement>(null);
  const [open, setOpen] = React.useState(false);
  const span = (
    <span ref={ref} className={cn("block min-w-0", className ?? "truncate")}>
      {children ?? text}
    </span>
  );
  // A caller's own tooltip wins, and without a provider there is none to show.
  if (!scope.provided || scope.insideTrigger) return span;
  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        setOpen(next && ref.current !== null && isTextCut(ref.current));
      }}
    >
      <TooltipTrigger asChild>{span}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-[320px]">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
