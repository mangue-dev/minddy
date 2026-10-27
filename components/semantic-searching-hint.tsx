"use client";

import type { ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** Where an issue picker's search by meaning (MIN-718) stands. */
export type SemanticSearchStatus = "searching" | "none";

/**
 * The status row an issue picker shows for its search by meaning: still
 * running, or answered with nothing related. Without it, a query with no text
 * match leaves an empty or missing list, and nothing says whether results are
 * still coming.
 */
export function SemanticSearchingHint({
  status = "searching",
  className,
  ...props
}: ComponentProps<"div"> & { status?: SemanticSearchStatus }) {
  const t = useTranslations("Picker");
  return (
    <div
      role="status"
      data-semantic-searching={status === "searching" ? "" : undefined}
      className={cn("flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    >
      {status === "searching" && <Spinner className="size-3 shrink-0" />}
      <span className="truncate">{t(status === "searching" ? "searchingByMeaning" : "noRelatedByMeaning")}</span>
    </div>
  );
}
