"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Measure overflowing activity text after layout and preserve its focusable DOM. */
export function OneLine({ full, children }: { full: string; children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [truncated, setTruncated] = useState(false);
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

  return <Tooltip open={truncated ? undefined : false}>
    <TooltipTrigger asChild>
      <p ref={ref} className="min-w-0 flex-1 truncate text-sm">{children}</p>
    </TooltipTrigger>
    <TooltipContent className="max-w-xs">{full}</TooltipContent>
  </Tooltip>;
}
