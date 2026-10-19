"use client";

import { useMobileLayout } from "@/lib/use-mobile-layout";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * `Kbd` / `KbdSequence` — minddy's keyboard key and shortcut primitives.
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
 * radius is explicit because the token scale of app/tokens.css redefines
 * `rounded-md` (0.375rem) to 14px.
 */
export function Kbd({
  className,
  size = "default",
  children,
  ...props
}: KbdProps) {
  const mobile = useMobileLayout();
  if (mobile !== false) return null;
  const square = isSingleGlyph(children);
  return (
    <kbd
      data-slot="kbd"
      data-square={square || undefined}
      className={cn(
        // `tracking-normal`: a key cap often sits inside a `tracking-widest`
        // shortcut span (dropdown menus); the inherited letter-space is added
        // AFTER the glyph, so a centered flex item came out visibly left of
        // center inside the fixed square.
        "inline-flex items-center justify-center tracking-normal rounded-[0.375rem] border [border-color:color-mix(in_srgb,currentColor_30%,transparent)] [color:color-mix(in_srgb,currentColor_75%,transparent)] [font-family:var(--font-kbd)] font-semibold",
        // `leading-*` equals the cap's own height, per size. The flex
        // centering centers the text's LINE BOX, whose height is the
        // INHERITED line-height — it varies per surface (menu rows, cheat
        // sheet rows, tooltips) and when (cap height − line box) / 2 lands on
        // a half pixel, Chromium snaps the baseline a full pixel low: the
        // glyph visibly sags. A line box exactly as tall as the cap fills the
        // flex item with no rounding ambiguity, and the ink measures dead
        // center on every surface. Measured at 4× DPR, Chromium, SF Pro:
        // 15px cap centered at line-height 15px, sagged 1px at 10/12/14px;
        // 18px cap centered at 18px, sagged at 16/17/19px.
        square
          ? size === "sm"
            ? "size-[15px] text-[10px] leading-[15px]"
            : "size-[18px] text-[11px] leading-[18px]"
          : size === "sm"
            ? "h-[15px] min-w-[15px] px-1 text-[10px] leading-[15px]"
            : "h-[18px] min-w-[18px] px-1 text-[11px] leading-[18px]",
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
  const mobile = useMobileLayout();
  if (mobile !== false) return null;
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
