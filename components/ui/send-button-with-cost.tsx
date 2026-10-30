"use client";

import { ArrowUp, Coins } from "lucide-react";
import { Spinner } from "./spinner";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./tooltip";

interface SendButtonWithCostProps {
  /** Credit cost to display next to the icon. Pass `null` to hide the cost (icon-only button). */
  cost: number | null;
  isLoading: boolean;
  disabled: boolean;
  onClick: () => void;
  tooltipLabel: React.ReactNode;
  ariaLabel: string;
}

export function SendButtonWithCost({
  cost,
  isLoading,
  disabled,
  onClick,
  tooltipLabel,
  ariaLabel,
}: SendButtonWithCostProps) {
  const showCost = cost !== null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "inline-flex h-8 items-center justify-center rounded-full text-[11px] font-medium leading-none tabular-nums transition-colors",
            "bg-primary text-primary-foreground",
            "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
            "enabled:hover:bg-primary-hover",
            showCost ? "gap-1 px-1.5 py-1.5" : "w-8 p-0",
          )}
        >
          {showCost ? (
            <>
              <span className="inline-flex items-center gap-1">
                <Coins className="h-3 w-3" />
                {cost}
              </span>
              <span className="h-3 w-px bg-primary-foreground/30" />
            </>
          ) : null}
          {isLoading ? (
            <Spinner className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowUp className="h-3.5 w-3.5" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltipLabel}</TooltipContent>
    </Tooltip>
  );
}
