"use client";

import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { Button, cn, transitions } from "mangue-ui";
import { useNewVersion } from "@/lib/use-new-version";

/**
 * “A new version is available” (MIN-157): a more recent deployment
 * that the code loaded in this tab is online, we suggest reloading.
 *
 * Discreet and resealable — it's information, not interruption. Close
 * memorizes the refused SHA: this deployment will no longer reopen it, the next one will.
 *
 * Position: `bottom-24` clears the three occupants of the lower right corner — the FAB
 * from Numo (`bottom-4 md:bottom-6`), the mobile navigation bar under 1200 px,
 * and the cookies headband. Deliberately NOT hidden in Zen mode: it is a
 * application event, rare and resealable, not chrome.
 */
export function NewVersionBanner() {
  const t = useTranslations("NewVersion");
  const { visible, dismiss, refresh, refreshing } = useNewVersion();

  return (
    // The live region is mounted PERMANENTLY, empty as long as there is nothing to
    // say. A region `aria-live` created at the same time as its contents is not
    // not announced: screen readers monitor the regions they
    // already knew. Empty, the container measures 0 × 0 and does not intercept anything.
    <div
      role="status"
      aria-live="polite"
      className={cn(
        // Re-anchors the headband to the corner of the shell centered on ultrawide
        // (≥2200px) — voir globals.css `.ultrawide-canvas`.
        "new-version-anchor",
        // `w-max`: the card is cut on its sentence, which then fits on a
        // line. Bounded to a frame rather than a fixed `max-w-xs` — at 320 px the
        // sentence was cut in the middle, and on a narrow telephone the card
        // was overflowing.
        "fixed right-4 bottom-24 z-40 md:right-6",
        "w-max max-w-[calc(100vw-2rem)]",
        "pb-[env(safe-area-inset-bottom)]",
        !visible && "pointer-events-none",
      )}
    >
      <AnimatePresence>
        {visible && (
          <motion.div
            key="new-version-banner"
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={transitions.gentle}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-lg"
          >
            <p className="text-sm text-card-foreground">{t("title")}</p>
            {/*
              Two signs of life, without which the button appears inert:

              — the overview. The `default` variant of mango-ui ONLY recolors
                rendu en lien (`[a]:hover:bg-primary/80`, soit `:is(a):hover`
                once compiled); on a real <button>, nothing happens.
                We restore the color that the bookstore itself applies to its
                solid buttons (`send-button-with-cost`), and the main cursor,
                that Tailwind v4 no longer sets `button`.
              — the click. Reloading does not display anything during its second of
                latency: the spinner and the disabled state fill it, and
                avoid the second click.
            */}
            <Button
              size="sm"
              onClick={refresh}
              disabled={refreshing}
              className="cursor-pointer enabled:hover:bg-primary/90"
            >
              {refreshing && <Loader2 className="animate-spin" />}
              {t("refresh")}
            </Button>
            <button
              type="button"
              onClick={dismiss}
              aria-label={t("dismiss")}
              className={cn(
                "-mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md",
                "text-muted-foreground hover:bg-accent hover:text-foreground",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "cursor-pointer",
              )}
            >
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
