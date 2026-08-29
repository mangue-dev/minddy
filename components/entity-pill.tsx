"use client";

// The PILL: Minddy’s little label “one thing, with its face”.
//
// It was born in the context of Numo (components/assistant/context-pill.tsx),
// and the resources of a ticket carried it on their side, in close copy.
// Two copies means two renderings, and this is what was visible: rays which do not
// do not respond to each other, a cross which pushes the wording, a gray figure where the other is
// tinted. The drawing therefore lives HERE, once, and the two surfaces dress it.
//
// What the design is about, and which is not decorative:
//
// • CONCENTRIC RAYS. The square icon is a CHILD of the pill: its
// radius is “pill radius − padding” (4px). In `rounded-md` (14px)
// the icon is at 10px; in `rounded-full` it is also round. A square
// fixed radius in a round pill is exactly the error it corrects.
//
// • CONTROL FROM ABOVE. Remove/Ignore appears superimposed on the end
// of the wording, with a gradient towards the color of the pill — it does not take
// no room next to it. Reserving a gutter for it would leave a gap on the right
// of EACH pill at rest, for a button that you only see on hover.

import type { ReactNode } from "react";
import { cn } from "mangue-ui";

export type PillRadius = "full" | "md";

/** Inner radius = radius of the pill − its padding (4px). */
export const PILL_INNER_RADIUS: Record<PillRadius, string> = {
  full: "rounded-full",
  md: "rounded-[10px]",
};

/**
 * The figure of the pill: a tinted 20px square, with a concentric radius.
 * `tint` background AND icon color (`bg-…/12 text-…`) — a 12% tint,
 * because it's a marker that you read out of the corner of your eye, not a tablet.
 */
export function PillIcon({
  radius = "full",
  tint,
  className,
  children,
}: {
  radius?: PillRadius;
  tint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden",
        PILL_INNER_RADIUS[radius],
        tint ?? "bg-muted text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}

export interface PillAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Visible at all times rather than on hover — for a command that is the
 only return path (an extinct pill, for example). */
  persistent?: boolean;
}

/**
 * The envelope: border, background, shadow, radius, and the overprint command.
 * The CONTENT (figure, wording, complement) is composed by the caller, who is
 * only you know if it should be a link, a button or inert text.
 */
export function EntityPill({
  radius = "full",
  dimmed = false,
  highlight = false,
  ariaLabel,
  action,
  className,
  children,
}: {
  radius?: PillRadius;
  /** Extinguished Pill: Diminished, but still there. */
  dimmed?: boolean;
  /** Highlight the entire envelope when its content is interactive. */
  highlight?: boolean;
  ariaLabel?: string;
  action?: PillAction;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      aria-label={ariaLabel}
      data-disabled={dimmed || undefined}
      className={cn(
        "group/pill relative flex min-w-0 max-w-full items-center gap-1.5 border border-border bg-card py-1 pl-1 pr-2.5 text-xs shadow-sm transition-colors",
        highlight &&
          "hover:border-foreground/15 hover:bg-accent/70 focus-within:border-foreground/15 focus-within:bg-accent/70",
        radius === "full" ? "rounded-full" : "rounded-md",
        dimmed && "opacity-60",
        className
      )}
    >
      {children}
      {action && (
        <span
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 flex items-center rounded-[inherit] bg-gradient-to-l from-card via-card to-transparent pl-4 pr-1 transition-[opacity,--tw-gradient-from,--tw-gradient-via]",
            highlight &&
              "group-hover/pill:from-accent group-hover/pill:via-accent",
            // On the keyboard, it is the focus of the button which reveals it - otherwise we
            // would rely on an invisible.
            action.persistent
              ? "opacity-100"
              : "opacity-0 group-hover/pill:opacity-100 has-[:focus-visible]:opacity-100"
          )}
        >
          <button
            type="button"
            aria-label={action.label}
            title={action.label}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              action.onClick();
            }}
            className="pointer-events-auto flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none"
          >
            {action.icon}
          </button>
        </span>
      )}
    </span>
  );
}
