"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "mangue-ui";
import type { LucideIcon } from "lucide-react";

export type SidebarNavRailItem = {
  value: string;
  label: string;
  icon?: LucideIcon;
  /** Attention badge on the row — something is incomplete there. Tea
 string is what the hover says and what a screen reader reads: the dot
 alone would tell nothing to anyone who doesn't see it. */
  indicator?: string;
};

/**
 * The rail of a secondary sidebar whose rows choose a PANEL and
 * not an object: the settings (account and project) and the admin.
 *
 * These are our cards, and no longer the `Tabs` from mango-ui. The library has
 * gained in 0.6.0 a SLIDING indicator, a `<span>` painted in the list at
 * template of the active tab (`rounded-full`, `bg-background`, `shadow-sm`, and
 * a border in dark). It is invisible in a classic tab bar,
 * where it IS the background of the active tab — but here the selection is already drawn
 * by the `layoutId` patch below, and the two overlapped: a clear capsule bordered, at the wrong corners, under the patch. Neutralize the
 * background of the trigger did not reach it — it does not live on the trigger.
 *
 * The rendering does not move a pixel: same rows, same slide that slides,
 * same labels. What disappears is the semantics of tabs, of which this rail
 * no longer had use: the list leaves by portal in the chassis (therefore outside the
 * DOM of its `<Tabs>`), and the state lives in `?tab=`. One button per panel, with
 * `aria-current`, this is the grammar of the other secondary bars — that of
 * sorting, returns, pull requests.
 */
export function SidebarNavRail({
  items,
  value,
  onValueChange,
  label,
}: {
  items: SidebarNavRailItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** The list name for a screen reader (the screen title). */
  label: string;
}) {
  const reduceMotion = useReducedMotion();
  // `layoutId` is GLOBAL to framer-motion: two rails mounted at the same time
  // (a route transition which superimposes two screens) would steal the
  // pellet. One id per instance closes the door.
  const pillId = `sidebar-nav-pill-${useId()}`;

  return (
    <nav aria-label={label}>
      <ul className="flex flex-col gap-1 px-2 pt-2 pb-4">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.value === value;
          return (
            <li key={item.value}>
              <button
                type="button"
                onClick={() => onValueChange(item.value)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "relative flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium outline-none transition-colors",
                  active
                    ? "text-foreground"
                    : "text-foreground/60 hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted/60 dark:text-muted-foreground dark:hover:text-foreground",
                )}
              >
                {/* `layoutId`: only one pad mounted at a time, which
 framer-motion SLIDEs to the new row instead of
 disappearing here and reappearing there. */}
                {active && (
                  <motion.span
                    layoutId={pillId}
                    aria-hidden
                    className="absolute inset-0 rounded-lg bg-muted"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 500, damping: 40 }
                    }
                  />
                )}
                {/* Positioned, therefore painted ABOVE the pad (same stack,
 order of the DOM): without this span, the absolute would pass over
 the label, which is not positioned. */}
                <span className="relative flex min-w-0 flex-1 items-center gap-2">
                  {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
                  <span className="truncate">{item.label}</span>
                  {item.indicator && (
                    <span
                      className="ml-auto flex items-center"
                      title={item.indicator}
                    >
                      <span
                        className="size-1.5 rounded-full bg-amber-500"
                        aria-hidden
                      />
                      <span className="sr-only">{item.indicator}</span>
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
