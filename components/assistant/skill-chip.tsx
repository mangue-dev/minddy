"use client";

import { Layers } from "lucide-react";
import { cn } from "mangue-ui";

/** Compact skill badge shared by the composer and sent messages. */
export function SkillChip({
  name,
  className,
  onClick,
}: {
  name: string;
  className?: string;
  onClick?: () => void;
}) {
  const chipClassName = cn(
    "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-[5px] border border-emerald-600/20 bg-emerald-500/15 px-1.5 py-px align-baseline text-[0.95em] font-medium leading-4 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-400",
    onClick &&
      "cursor-pointer transition-colors hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
    className,
  );
  const content = (
    <>
      <Layers className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{name}</span>
    </>
  );

  return onClick ? (
    <button
      type="button"
      className={chipClassName}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      aria-haspopup="dialog"
    >
      {content}
    </button>
  ) : (
    <span className={chipClassName}>{content}</span>
  );
}
