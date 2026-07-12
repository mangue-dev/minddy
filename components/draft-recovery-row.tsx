"use client";

import { useTranslations } from "next-intl";
import { FileClock, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, cn } from "mangue-ui";

/** Minimal shape the row needs — either draft kind maps onto it. */
export interface DraftSummary {
  id: string;
  /** Title / name; empty falls back to the "Untitled" label. */
  title: string;
}

/**
 * The recovery row shown above the title field of a create dialog (MIN-41).
 * Lists this project's saved drafts, most recent first, as chips: click the
 * label to restore a draft into the form, the × to delete it. Renders nothing
 * when there are no drafts (so a first-time, draft-free form stays clean).
 */
export function DraftRecoveryRow({
  drafts,
  onRecover,
  onDelete,
  className,
}: {
  drafts: DraftSummary[];
  onRecover: (id: string) => void;
  onDelete: (id: string) => void;
  className?: string;
}) {
  const t = useTranslations("Drafts");
  if (drafts.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      <span className="inline-flex items-center gap-1 pr-0.5">
        <FileClock className="size-3.5" aria-hidden />
        {t("recent")}
      </span>
      {drafts.map((d) => (
        <span
          key={d.id}
          className="inline-flex items-center rounded-full border border-border bg-muted/40 pl-2.5 transition-colors hover:bg-muted"
        >
          <button
            type="button"
            onClick={() => onRecover(d.id)}
            className="max-w-[13rem] truncate py-0.5 text-foreground outline-none"
          >
            {d.title.trim() || t("untitled")}
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onDelete(d.id)}
                aria-label={t("delete")}
                className="ml-0.5 flex size-5 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
              >
                <X className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("delete")}</TooltipContent>
          </Tooltip>
        </span>
      ))}
    </div>
  );
}
