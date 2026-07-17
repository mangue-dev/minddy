"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  transitions,
  buttonTap,
  Kbd,
  KbdSequence,
} from "mangue-ui";
import { NumoIcon } from "@/components/numo-icon";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { useChordPrefix, CHORD_PREFIX } from "@/lib/keyboard/keyboard-context";

/**
 * Minimal circular FAB that opens the global assistant panel. Hover reveals a
 * tooltip with the label — no permanent label. Hides while the panel is open.
 */
export function AssistantFab() {
  const { isOpen, toggle, ambientContext } = useAssistantPanel();
  const hasContext = ambientContext !== null;
  const chordArmed = useChordPrefix() === CHORD_PREFIX;
  const t = useTranslations("Assistant");
  const tk = useTranslations("Keyboard");
  // La page Agents A DÉJÀ la conversation de Numo en plein écran : le FAB flottant y
  // ferait doublon → on le masque uniquement là (l'anim de sortie joue au passage).
  const pathname = usePathname();
  const hiddenForRoute = pathname.startsWith("/agents");

  return (
    <AnimatePresence>
      {!isOpen && !hiddenForRoute && (
        <motion.div
          key="assistant-fab"
          initial={{ opacity: 0, y: 14, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.92 }}
          transition={{ ...transitions.gentle, delay: 0.35 }}
          className={cn(
            // `assistant-fab-anchor` ré-ancre le FAB au coin du shell centré
            // sur ultrawide (≥2200px) — voir globals.css `.ultrawide-canvas`.
            "assistant-fab-anchor",
            // Hidden below the 1200px mobile cutover — there the assistant is
            // reached from the mobile navbar's Numo button (single entry point),
            // and the FAB would overlap the bottom nav.
            "max-desktop:hidden",
            "fixed z-40",
            "right-4 bottom-4 md:right-6 md:bottom-6",
            "pb-[env(safe-area-inset-bottom)]",
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                type="button"
                onClick={() => toggle()}
                aria-label={t("title")}
                whileHover={{ y: -1, transition: transitions.snappy }}
                whileTap={buttonTap.whileTap}
                className={cn(
                  "relative inline-flex items-center justify-center rounded-full",
                  "h-10 w-10 md:h-11 md:w-11",
                  "bg-card/95 supports-backdrop-filter:backdrop-blur-md",
                  "ring-1 ring-foreground/10 hover:ring-foreground/20",
                  "text-foreground",
                  "shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25),0_2px_6px_-2px_rgba(0,0,0,0.1)]",
                  "hover:shadow-[0_12px_28px_-12px_rgba(0,0,0,0.3),0_3px_8px_-2px_rgba(0,0,0,0.12)]",
                  "transition-shadow",
                  "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "cursor-pointer",
                )}
              >
                <NumoIcon className="size-5 text-foreground" />
                {/* G-chord armed: surface the completion key (G then A). */}
                <AnimatePresence>
                  {chordArmed && (
                    <motion.span
                      key="assistant-fab-chord-hint"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={transitions.snappy}
                      className="absolute -top-1.5 -right-1.5"
                    >
                      <Kbd size="sm" className="shadow-sm ring-1 ring-border">
                        A
                      </Kbd>
                    </motion.span>
                  )}
                </AnimatePresence>
                {/* Blue dot: the assistant has a current page context (issue…). */}
                <AnimatePresence>
                  {hasContext && !chordArmed && (
                    <motion.span
                      key="assistant-fab-context-badge"
                      initial={{ opacity: 0, scale: 0.4 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.4 }}
                      transition={transitions.snappy}
                      aria-hidden
                      className={cn(
                        // Tucked onto the FAB's top-right edge (not floating
                        // beyond the corner — the button is round, so a negative
                        // offset reads as detached).
                        "absolute top-0.5 right-0.5",
                        "size-2.5 rounded-full bg-primary",
                        "ring-2 ring-card",
                      )}
                    />
                  )}
                </AnimatePresence>
              </motion.button>
            </TooltipTrigger>
            <TooltipContent
              side="left"
              sideOffset={10}
              className="flex items-center gap-2 max-w-none"
            >
              <span>{t("title")}</span>
              <KbdSequence
                keys={[["G"], ["A"]]}
                size="sm"
                separator={tk("then")}
              />
            </TooltipContent>
          </Tooltip>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
