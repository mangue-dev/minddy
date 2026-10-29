"use client";

import { useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AppIcon } from "@/components/icon";
import { cn } from "@/lib/utils";
import {
  assistantStarters,
  type AssistantStarterPage,
} from "@/lib/assistant-starters";

/**
 * The suggestion rows shown above an empty Numo composer: in the panel over
 * every page, and on the home page above its own composer. Choosing a row
 * hands its prompt to `onPick`, which fills the composer without sending it.
 *
 * Desktop layout only, like the panel always had it: on a phone the rows
 * would push the composer off a screen that is already short.
 */
export function AssistantStarterList({
  page,
  visible,
  onPick,
  className,
}: {
  page: AssistantStarterPage;
  visible: boolean;
  onPick: (prompt: string) => void;
  className?: string;
}) {
  const t = useTranslations("Assistant");
  const reducedMotion = useReducedMotion();
  const starters = useMemo(() => assistantStarters(page), [page]);

  return (
    // "wait" keeps the leaving rows in flow until their exit ends.
    // "popLayout" would pull them out of flow: a bottom-anchored container
    // then shrinks at once and the rows land behind the composer instead of
    // fading where they stood.
    <AnimatePresence initial={false} mode="wait">
      {visible && (
        <motion.div
          key={page}
          role="list"
          aria-label={t("startersLabel")}
          className={cn("mb-2 hidden flex-col divide-y divide-border/70 app-desktop:flex", className)}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(6px)", y: 6 }}
          animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(6px)", y: 6 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
        >
          {starters.map(({ key, icon, iconClassName }) => {
            const title = t(`starters.${page}.${key}.title` as const);
            const prompt = t(`starters.${page}.${key}.prompt` as const);
            return (
              <div key={key} role="listitem" className="py-0.5">
                <Button
                  className="h-auto w-full justify-start gap-3 rounded-lg px-3 py-2 text-left font-normal whitespace-normal text-muted-foreground hover:text-foreground"
                  onClick={() => onPick(prompt)}
                  type="button"
                  variant="ghost"
                >
                  <AppIcon
                    icon={icon}
                    className={cn("size-4 shrink-0", iconClassName)}
                    aria-hidden
                  />
                  <span className="text-sm leading-5">{title}</span>
                </Button>
              </div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
