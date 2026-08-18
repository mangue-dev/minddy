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
 * `@/components/ui/kbd` by `mangue-ui` and delete this file. This is not
 * a divergence — the content must remain IDENTICAL upstream.
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
 * Keyboard key indicator. Locks text color to `text-foreground` so the key
 * stays readable on its `bg-muted` background regardless of the parent's
 * text color (tooltips invert foreground/background, etc.).
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
        "inline-flex items-center justify-center rounded border border-border bg-muted text-foreground font-mono",
        square
          ? size === "sm"
            ? "size-4 text-[10px]"
            : "size-5 text-xs"
          : size === "sm"
            ? "h-4 min-w-4 px-1.5 text-[10px]"
            : "h-5 min-w-5 px-1.5 text-xs",
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
