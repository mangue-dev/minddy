"use client";

import { Sparkles } from "lucide-react";
import { cn } from "mangue-ui";

/** Compact, non-interactive badge shared by the composer and sent messages. */
export function SkillChip({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-[5px] bg-brand/12 px-1.5 py-px align-baseline text-[0.95em] font-medium leading-4 text-brand",
        className,
      )}
    >
      <Sparkles className="size-3 shrink-0" aria-hidden />
      <span className="truncate">/{name}</span>
    </span>
  );
}
