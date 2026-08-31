"use client";

import type { ReactNode } from "react";
import { cn } from "mangue-ui";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Shared Chrome of the statistics page (MIN-85).
 *
 * Layout rule: the title of a section ALWAYS lives above its
 * card, never in it. This is what allows you to nest content (bars,
 * subcards) without stacking three levels of borders like the old “Cycles” section did.
 */

/** Small “i” with a tooltip explaining what a metric counts. */
export function InfoHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={text}
          className="inline-flex shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] text-xs leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

/** Section header: title + optional info, then a context line. */
export function StatsSectionHeader({
  title,
  info,
  description,
}: {
  title: string;
  info?: string;
  description?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5">
        {/* Normal case: the title is distinguished by its boldness, not by uppercase
 — this is the convention for other screens in the app. */}
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {info ? <InfoHint text={info} /> : null}
      </div>
      {description ? (
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

/** Complete section: off-map header + children (often a `StatsCard`). */
export function StatsSection({
  id,
  title,
  info,
  description,
  className,
  children,
}: {
  id?: string;
  title: string;
  info?: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn("mt-8", id && "scroll-mt-20 rounded-xl", className)}
    >
      <StatsSectionHeader title={title} info={info} description={description} />
      {children}
    </section>
  );
}

/** Single map surface, reused as is by all sections. */
export function StatsCard({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className={cn(
        "rounded-xl border border-border bg-card p-5 text-card-foreground",
        id && "scroll-mt-20",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A metric. Two weights:
 * - `hero`: the 3 digits of the “at the moment” banner (3xl text);
 * - `card`: a secondary measurement inside a card (2xl text).
 * The label comes before the value: we read this that we look at, then how many.
 */
export function Metric({
  label,
  value,
  hint,
  info,
  variant = "card",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  info?: string;
  variant?: "hero" | "card";
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-medium text-muted-foreground">
          {label}
        </span>
        {info ? <InfoHint text={info} /> : null}
      </div>
      <div
        className={cn(
          "font-semibold tabular-nums tracking-tight text-foreground",
          variant === "hero" ? "text-3xl" : "text-2xl",
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/** A measurement of the tape “from the beginning” — small, aligned, without a map. */
export function TotalItem({
  label,
  value,
  info,
}: {
  label: string;
  value: number | string;
  info?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="truncate">{label}</span>
        {info ? <InfoHint text={info} /> : null}
      </span>
    </div>
  );
}
