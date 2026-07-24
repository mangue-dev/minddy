/**
 * usePalette - Convenience controller for the palette open state.
 *
 * Handles the global keyboard shortcut (default ⌘K / Ctrl+K) and returns
 * the props to spread on <CommandPalette>.
 *
 * ```tsx
 * const palette = usePalette();               // ⌘K by default
 * <CommandPalette {...palette.paletteProps} items={items} />
 * ```
 */

import { useCallback, useEffect, useMemo, useState } from "react";

export interface UsePaletteOptions {
  /**
   * Hotkey combo, "mod+k" style ("mod" = ⌘ on macOS, Ctrl elsewhere).
   * Pass null to disable the built-in listener.
   */
  hotkey?: string | null;
}

export interface PaletteController {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Spread onto <CommandPalette>. */
  paletteProps: { isOpen: boolean; onClose: () => void };
}

/** True on macOS/iOS (used to map "mod" to ⌘ vs Ctrl). */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform ?? navigator.userAgent);
}

/**
 * Lowercased `event.key`, or `""` when the event carries no key.
 *
 * Global `keydown` listeners also receive synthetic events dispatched by
 * browser extensions and IME layers, which are often built with
 * `new Event("keydown")` and have no `key` — `e.key.toLowerCase()` would throw
 * and take the host app down. `""` matches no shortcut, so callers fall through.
 */
export function eventKey(e: Pick<KeyboardEvent, "key">): string {
  return typeof e.key === "string" ? e.key.toLowerCase() : "";
}

function matchesCombo(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const wantsMod = parts.includes("mod");
  const wantsShift = parts.includes("shift");
  const wantsAlt = parts.includes("alt");

  const mod = isApplePlatform() ? e.metaKey : e.ctrlKey;

  return (
    eventKey(e) === key &&
    (!wantsMod || mod) &&
    (wantsShift ? e.shiftKey : !e.shiftKey) &&
    (wantsAlt ? e.altKey : !e.altKey)
  );
}

export function usePalette(options: UsePaletteOptions = {}): PaletteController {
  const { hotkey = "mod+k" } = options;
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  useEffect(() => {
    if (!hotkey) return;

    const handler = (e: KeyboardEvent) => {
      if (matchesCombo(e, hotkey)) {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [hotkey]);

  const paletteProps = useMemo(
    () => ({ isOpen, onClose: close }),
    [isOpen, close]
  );

  return { isOpen, open, close, toggle, paletteProps };
}

export default usePalette;
