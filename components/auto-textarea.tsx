"use client";

import { useRef } from "react";
import { cn } from "mangue-ui";
import { useAutosize } from "@/lib/use-autosize";

/** A textarea that grows with its content instead of scrolling. Behaves like a
    wrapping single-line field: give it `rows={1}` sizing via className. */
export function AutoTextarea({
  value,
  className,
  ref: refProp,
  ...props
}: React.ComponentProps<"textarea"> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutosize(ref, value);
  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        if (typeof refProp === "function") refProp(el);
        else if (refProp) refProp.current = el;
      }}
      value={value}
      rows={1}
      className={cn("resize-none", className)}
      {...props}
    />
  );
}
