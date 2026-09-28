"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { cn } from "mangue-ui";
import type { Category } from "@/lib/types";

export function CategoryPill({
  category,
  onRemove,
  className,
}: {
  category: Category;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs",
        className
      )}
    >
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: category.color }}
        aria-hidden
      />
      <span className="truncate">{category.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 text-muted-foreground hover:text-foreground"
          aria-label={`Retirer ${category.name}`}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
        </button>
      )}
    </span>
  );
}
