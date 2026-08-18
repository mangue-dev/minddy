"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "mangue-ui/lib/utils";
import { NumoFace } from "@/components/numo-face";
import { IsoIcon } from "@/components/illustrations/iso-icon";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";

/**
 * The "Product" menu of the public nav.
 *
 * Why a menu and not six links: the nav pointed to four anchors at random
 * of the page map ("The tracker", "The agents", "Prices", "FAQ"), this
 * which forced the visitor to guess what was behind each one. A single word — Product — and six read-at-a-glance entries require one more hover, but remove the guesswork.
 *
 * HAND-WRITTEN rather than Radix NavigationMenu: primitive is not re-exported
 * by `mangue-ui` and the package is not live-resolvable
 * (strict pnpm). Adding it as a dependency would require resynchronizing the two
 * lockfiles of the repository for a single component.
 *
 * This is taken from the primitive, because it is what makes the difference
 * between a usable menu and a menu which closes under the cursor:
 *
 * - **Delayed close.** Exiting the trigger to enter the panel
 * moves the cursor over the gap. Without delay, the menu closes
 * during the trip.
 * - **No dead zone.** The space between the pad and the panel is IN
 * the hovered area (padding of the container, not panel margin).
 * - **Keyboard.** The trigger is a real button: Enter / Space / Arrow
 * down opens, Escape closes and returns focus. The panel remains open as long as
 * the focus is in it, otherwise we would not be able to cross it at Tab.
 * - **Tactile.** Hover does not exist: clicking switches.
 */

/**
 * Product menu slugs. Union of literals, not `string`: this is what
 * allows TypeScript to resolve `navMenu_${key}_title` into real keys and to confront them with the catalog. Adding an entry without adding its two messages
 * does not compile.
 */
export type ProductEntryKey =
  | "tracker"
  | "speed"
  | "agents"
  | "numo"
  | "pages"
  | "feedback"
  | "more"
  | "mcp"
  | "download";

export type ProductEntry = {
  /** i18n key: `navMenu_<key>_title` and `navMenu_<key>_desc`. */
  key: ProductEntryKey;
  href: string;
  /** `null` for Numo, which has its own logo rather than a generic icon. */
  icon: LucideIcon | null;
};

/** Grace period before closing, time to cross to the sign. */
const CLOSE_DELAY_MS = 140;

export function NavProductMenu({
  entries,
  label,
  locale,
  className,
}: {
  entries: ReadonlyArray<ProductEntry>;
  label: string;
  /** Language served: anchors point to `/fr` when the page is in French. */
  locale: Locale;
  className?: string;
}) {
  const t = useTranslations("Landing");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  // Close escape and RETURN FOCUS to the trigger: without this, the focus remains on
  // an element that has just disappeared and the tabulation starts again from the document.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      className={cn("relative", className)}
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      // Focus leaving the block closes the menu — but only if it leaves
      // REALLY elsewhere, hence the test on the incoming target.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "flex items-center gap-1 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          open ? "text-foreground" : "hover:text-foreground",
        )}
      >
        {label}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>

      {/* `pt-3` on the container and not a margin on the panel: the gap with
 the patch must remain hoverable, otherwise the menu closes as soon as you
 descends towards it. `-translate-x-1/2` centers it under its trigger. */}
      <div
        id={panelId}
        className={cn(
          "absolute top-full left-1/2 z-50 -translate-x-1/2 pt-3",
          !open && "pointer-events-none",
        )}
      >
        <div
          className={cn(
            // 36rem: two columns where each description fits on ONE line.
            // Narrower, three entries returned to the line and shifted
            // their neighbors — the grid read crookedly.
            // OPAQUE background, unlike the nav badge: the badge of the
            // hero showed through a `bg-popover/95`, and a menu
            // who lets the page behind him read reads half as fast.
            "w-[min(92vw,36rem)] origin-top rounded-2xl border border-border bg-popover p-2 shadow-xl",
            "transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            open ? "translate-y-0 scale-100 opacity-100" : "-translate-y-1 scale-[0.98] opacity-0",
          )}
        >
          <ul className="grid gap-0.5 sm:grid-cols-2">
            {entries.map((entry) => {
              const Icon = entry.icon;
              return (
                <li key={entry.key}>
                  <a
                    href={localizedHref(entry.href, locale)}
                    onClick={() => setOpen(false)}
                    tabIndex={open ? undefined : -1}
                    className="group flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none"
                  >
                    {/* The APPLICATION icons, placed on its isometric
 block (MIN-254). Until now it was a gray
 sticker with a lucid icon in it — the most neutral drawing possible, therefore one that said nothing about minddy,
 in what is often the first screen of the product that
 a visitor sees. They keep the brand color in all states: these are its three values ​​(the three faces of the solid) which carry the relief; repainting them with hovering over them would overwrite it. */}
                    {Icon ? (
                      <IsoIcon icon={Icon} className="w-11 shrink-0" />
                    ) : (
                      /* Numo wears his face: there is nothing to put on a
 block, it is already a brand design. */
                      <span className="flex w-11 shrink-0 items-center justify-center text-muted-foreground">
                        <NumoFace className="h-4 w-auto" />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {t(`navMenu_${entry.key}_title`)}
                      </span>
                      <span className="block text-xs leading-snug text-muted-foreground">
                        {t(`navMenu_${entry.key}_desc`)}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
