"use client";

import * as React from "react";
import { cn } from "mangue-ui";

/**
 * `Kbd` / `KbdSequence` — TEMPORARY DUPLICATION of `mangue-ui`, like the layer
 * settings before it.
 *
 * The fix (a key is square when it fits into a glyph) lives in
 * `~/Projets/mangue-ui/packages/mangue-ui/src/components/ui/kbd.tsx`, in 0.4.0
 * — unpublished. minddy consumes 0.3.0 from npm: without this copy, the
 * patch would be invisible here until the next release, and a bump
 * from mango-ui is not trivial (it can duplicate framer-motion and drown the
 * typecheck under type identity errors).
 *
 * TO REMOVE as soon as minddy switches to mango-ui ≥ 0.4.0: replace imports
 * `@/components/ui/kbd` by `mangue-ui` and delete this file. NOTE: the
 * styling now intentionally DIVERGES from upstream (transparent surface,
 * tinted border, sans glyphs — see the `Kbd` docstring below); port the new
 * look to mangue-ui before the switch or restore the old classes there.
 */

export type KbdProps = React.ComponentProps<"kbd"> & {
  size?: "sm" | "default";
};

/**
 * A key is SQUARE when it fits into a single glyph — a letter, ⌘, ⇧,
 * →, or an icon — and wide only when it is a word: Ctrl, Space, Esc,
 * Tab. This is the shape of a real keyboard, where only modifiers written in
 * all letters overflow.
 *
 * Without this rule, `px-1.5` applied to everything: a “⌘” came out wider
 * than the “K” placed next to it, and two keys supposed to be twins were
 * not. The case is seen wherever a shortcut is made into several pellets
 * (cheat sheet, search pill), that is to say everywhere.
 */
function isSingleGlyph(children: React.ReactNode): boolean {
  // An icon occupies the entire pad: square, like a letter.
  if (React.isValidElement(children)) return true;
  const text = typeof children === "number" ? String(children) : children;
  if (typeof text !== "string") return false;
  // Code points, not UTF-16 units: a compound arrow or emoji weighs
  // two units and are not less than a single key.
  return [...text.trim()].length === 1;
}

/**
 * Keyboard key indicator. Transparent surface with a tinted border so keys
 * read as outlines on any background; text and border share `currentColor`,
 * the glyph slightly muted (75%) and the border more so (30%) — so a key
 * inherits whatever color its surface is built for (foreground normally, the
 * inverted tooltip text on tooltips) without shouting. The font is
 * `--font-kbd` (see app/globals.css): Inter has none of the ⌘⇧⌥ glyphs. The
 * radius is explicit because the mangue-ui token scale redefines
 * `rounded-md` (0.375rem) to 14px.
 */
export function Kbd({
  className,
  size = "default",
  children,
  ...props
}: KbdProps) {
  const square = isSingleGlyph(children);
  return (
    <kbd
      data-slot="kbd"
      data-square={square || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-[0.375rem] border [border-color:color-mix(in_srgb,currentColor_30%,transparent)] [color:color-mix(in_srgb,currentColor_75%,transparent)] [font-family:var(--font-kbd)] font-semibold",
        square
          ? size === "sm"
            ? "size-[15px] text-[10px]"
            : "size-[18px] text-[11px]"
          : size === "sm"
            ? "h-[15px] min-w-[15px] px-1 text-[10px]"
            : "h-[18px] min-w-[18px] px-1 text-[11px]",
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}

export type KbdSequenceProps = {
  keys: string[][];
  /**
   * Separator rendered between successive chord steps. Accepts either a
   * plain string (wrapped automatically with the muted "then…" styling so
   * callers can pass a translated label) or any ReactNode for full control.
   * Defaults to the English "then".
   */
  separator?: React.ReactNode | string;
  size?: "sm" | "default";
  className?: string;
};

function renderSeparator(separator: React.ReactNode | string | undefined) {
  if (separator === undefined) separator = "then";
  if (typeof separator === "string") {
    return (
      <span className="text-current opacity-60 text-[10px]">{separator}</span>
    );
  }
  return separator;
}

export function KbdSequence({
  keys,
  separator,
  size = "default",
  className,
}: KbdSequenceProps) {
  const sep = renderSeparator(separator);
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {keys.map((parts, i) => (
        <React.Fragment key={i}>
          {i > 0 && sep}
          <span className="inline-flex items-center gap-0.5">
            {parts.map((p, j) => (
              <Kbd key={j} size={size}>
                {p}
              </Kbd>
            ))}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
}
