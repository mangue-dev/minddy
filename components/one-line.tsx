"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Measure overflowing activity text after layout and preserve its focusable
 * DOM. A part marked `data-one-line-lead` (the person who acted) has its own
 * hover card (MIN-879): over it, the full-text tooltip holds back.
 */
export function OneLine({ full, children }: { full: string; children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [truncated, setTruncated] = useState(false);
  const [overLead, setOverLead] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setTruncated(element.scrollWidth > element.clientWidth + 1);
    // ResizeObserver delivers after layout, including the initial observation.
    // One frame also handles changed text whose container width stays constant.
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [full]);

  return <Tooltip open={truncated && !overLead ? undefined : false}>
    <TooltipTrigger asChild>
      <p
        ref={ref}
        className="min-w-0 flex-1 truncate text-sm"
        onPointerOver={(event) =>
          setOverLead(!!(event.target as Element).closest?.("[data-one-line-lead]"))}
        onPointerLeave={() => setOverLead(false)}
      >
        {children}
      </p>
    </TooltipTrigger>
    <TooltipContent className="max-w-xs">{full}</TooltipContent>
  </Tooltip>;
}
