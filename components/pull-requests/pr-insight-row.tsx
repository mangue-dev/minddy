"use client";

import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { Popover, PopoverContent, PopoverTrigger, cn } from "mangue-ui";
import { PropertyRow, TRIGGER } from "@/components/issue-property-fields";

export type PrInsightTone = "danger" | "progress" | "success" | "neutral";

/** Match ticket property values while keeping details outside the page flow. */
export function PrInsightRow({
  label,
  summary,
  children,
  testId,
  detailsTestId,
  open,
  onOpenChange,
}: {
  label: string;
  summary: ReactNode;
  children: ReactNode;
  testId: string;
  detailsTestId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <PropertyRow label={label}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid={testId}
            className={cn(TRIGGER, "mr-0 min-w-0")}
          >
            {summary}
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          data-testid={detailsTestId}
          className="w-[min(26rem,calc(100vw-2rem))] p-3"
        >
          <h3 className="mb-3 text-sm font-medium">{label}</h3>
          <div className="max-h-[min(28rem,60dvh)] min-w-0 overflow-y-auto">
            {children}
          </div>
        </PopoverContent>
      </Popover>
    </PropertyRow>
  );
}
