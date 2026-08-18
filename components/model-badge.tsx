"use client";

import { cn } from "mangue-ui";
import { ModelLogo } from "@/components/model-logo";
import { formatModelName } from "@/lib/model-display";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Badge of an AI model (MIN-46): real logo of the provider (`ModelLogo`) + name
 * complete readable ("DeepSeek V4 Flash").
 *
 * By default, the raw OpenRouter id remains accessible on hover — this is what that we
 * copy into a config or that we look in a log, but it is not what
 * that we read. Where the badge is NOT technical data to copy but a
 * setting to understand, `tooltip` replaces this id with a sentence.
 */
export function ModelBadge({
  model,
  className,
  size = 14,
  fallbackLabel,
  tooltip,
}: {
  model: string | null | undefined;
  className?: string;
  size?: number;
  /**
 * What the badge says when NO pattern is set — a routine that follows the
 * default of its owner (MIN-185). Without it, the badge disappears: it is
 * the good choice where the model is a piece of data of the run (there is always one),
 * and the bad one where its absence IS the information.
 */
  fallbackLabel?: string;
  /**
 * Replaces the raw id on hover with a phrase that says what this badge IS.
 * This is also the only way to have a tooltip on the fallback badge:
 * without a set template, there are no ids to reveal.
 */
  tooltip?: string;
}) {
  const chip = cn(
    "inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border/60 bg-muted px-2 py-0.5 text-xs font-medium text-foreground/80",
    className,
  );

  const label = model ? formatModelName(model) : fallbackLabel;
  if (!label) return null;

  const badge = (
    <span className={chip}>
      <ModelLogo model={model} size={size} />
      <span className="truncate">{label}</span>
    </span>
  );

  // Nothing to hover over when there is neither sentence provided nor id to reveal.
  const content = tooltip ?? model;
  if (!content) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      {/* The monospaced font is that of an id that is copied; a phrase reads
 in the product font. */}
      <TooltipContent className={tooltip ? undefined : "font-mono"}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
