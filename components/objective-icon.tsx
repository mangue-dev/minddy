"use client";

// The icon of an objective — the target, in ITS color.
//
// An objective carries a color (optional, taken from the palette of
// categories). Wherever an icon designates THIS objective, it carries it: the
// Numo context pill, the mention placed in a description, the list
// “@” suggestions. The fallback of a lens without color is the gray of
// chips from the board, and not an invented tint: a lens without color has none
// pas.
//
// This component is NOT used where the target designates the NOTION of objective —
// the nav tab, “new objective” in the palette, the empty state of the
// page. There is no objective there whose color to follow, and the icon remains
// neutral: to dye it would be to designate an objective which does not exist.

import { Target } from "lucide-react";
import { cn } from "mangue-ui";

/** The color of an objective, including fallback — the same rule as the chips on the
 board (components/issue-property-fields, Dot). */
export function objectiveColor(color: string | null | undefined): string {
  return color ?? "var(--muted-foreground)";
}

/** The target, in the color of the objective. */
export function ObjectiveIcon({
  color,
  className,
}: {
  color?: string | null;
  className?: string;
}) {
  return (
    <Target className={className} style={{ color: objectiveColor(color) }} />
  );
}

/**
 * The target in its tinted patch: 12% of the color in the background, the full color
 * for the line — exactly the dosage of Numo's context pills,
 * of which it is the geometry. `color-mix` rather than a Tailwind class: the
 * color is a hexadecimal stored in base, not a token known at compile time.
 */
export function ObjectiveIconBadge({
  color,
  className,
  iconClassName,
}: {
  color?: string | null;
  className?: string;
  iconClassName?: string;
}) {
  const tone = objectiveColor(color);
  return (
    <span
      className={cn("flex items-center justify-center", className)}
      style={{
        backgroundColor: `color-mix(in oklab, ${tone} 12%, transparent)`,
        color: tone,
      }}
    >
      <Target className={iconClassName} />
    </span>
  );
}
