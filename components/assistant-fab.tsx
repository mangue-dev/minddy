"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  cn,
  transitions,
  buttonTap,
} from "mangue-ui";
import { Kbd, KbdSequence } from "@/components/ui/kbd";
import { NumoIcon } from "@/components/numo-icon";
import { AgentBeam } from "@/components/agent-beam";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { useAssistantBusy } from "@/lib/assistant-chat-context";
import { useChordPrefix, CHORD_PREFIX } from "@/lib/keyboard/keyboard-context";
import { useZenMode } from "@/lib/zen-mode-context";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Minimal circular FAB that opens the global assistant panel. Hover reveals a
 * tooltip with the label — no permanent label. Hides while the panel is open.
 *
 * Closing the panel during a turn no longer stops Numo (the conversation lives in
 * AssistantChatProvider): the FAB then carries the shared animated border of the app
 * as long as it works, and becomes inert again as soon as it is finished. It's his ONLY
 * signal — no context badge: what Numo is looking at can be read in the
 * panel, above the composer, not on the button that opens it.
 */
/** The pages where Numo is already reachable without him — cf. `hiddenForRoute`. */
const HIDDEN_ROUTES = ["/pull-requests"];

export function AssistantFab() {
  const { isOpen, toggle, fabSuppressed } = useAssistantPanel();
  // The boolean alone, not the entire conversation context (MIN-323): `state`
  // changes with each SSE token, and the FAB returns at this rate
  // to read a value that only moves twice per revolution.
  const isBusy = useAssistantBusy();
  const chordArmed = useChordPrefix() === CHORD_PREFIX;
  const t = useTranslations("Assistant");
  const tk = useTranslations("Keyboard");
  /**
   * Pull requests: the thread's composer is pinned at the bottom, with `@Numo` in its
   * suggestions, and the FAB hits its send button (MIN-162).
   *
   * The Agents page was here too, and it was too crude: the route doesn't say
   * not what the page SHOWS. The routines page displays a list without any
   * compose, and Numo becomes unreachable with the mouse even though nothing
   * covers. It is therefore the agent conversation itself which declares itself
   * (`useSuppressAssistantFab`), wherever it is mounted — open conversation,
   * an open routine run, or an issue modal.
   */
  const pathname = usePathname();
  const hiddenForRoute = HIDDEN_ROUTES.some((route) => pathname.startsWith(route));
  // Zen mode (MIN-134): the FAB leaves with the rest of the chrome. Numo remains
  // accessible from the keyboard (G then A), and its panel opens above.
  const { zen } = useZenMode();

  return (
    <AnimatePresence>
      {!isOpen && !hiddenForRoute && !fabSuppressed && !zen && (
        <motion.div
          key="assistant-fab"
          initial={{ opacity: 0, y: 14, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.92 }}
          transition={{ ...transitions.gentle, delay: 0.35 }}
          className={cn(
            // `assistant-fab-anchor` re-anchors the FAB to the corner of the centered shell
            // on ultrawide (≥2200px) — see globals.css `.ultrawide-canvas`.
            "assistant-fab-anchor",
            // Hidden below the 768px mobile cutover — there the assistant is
            // reached from the mobile navbar's Numo button (single entry point),
            // and the FAB would overlap the bottom nav.
            "max-desktop:hidden",
            "fixed z-40",
            "right-4 bottom-4 md:right-6 md:bottom-6",
            "pb-[env(safe-area-inset-bottom)]",
          )}
        >
          {/* `keepMounted`: the button must not be raised when the border
 turns on or off — otherwise its entry animation would replay
 each toggle. */}
          <AgentBeam
            active={isBusy}
            size="sm"
            keepMounted
            className="rounded-full"
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
                    // No `backdrop-blur`: `bg-card/95` already hides
                    // completely what is behind it. The vagueness cost
                    // composition layer for an invisible effect (MIN-323).
                    "bg-card/95",
                    "ring-1 ring-foreground/10 hover:ring-foreground/20",
                    "text-foreground",
                    "shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25),0_2px_6px_-2px_rgba(0,0,0,0.1)]",
                    "hover:shadow-[0_12px_28px_-12px_rgba(0,0,0,0.3),0_3px_8px_-2px_rgba(0,0,0,0.12)]",
                    "transition-shadow",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "cursor-pointer",
                  )}
                >
                  {/* `animated={false}` (MIN-323): the face animated
 SVG attributes loop, including masking under 768 px
 (`max-desktop:hidden` mask without unmounting). The activity signal
 already passes through the `AgentBeam` above. */}
                  <NumoIcon animated={false} className="size-5 text-foreground" />
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
          </AgentBeam>
          {/* G-chord armed: surface the completion key (G then A). Placed OUTSIDE
 border (whose wrapper is `overflow: hidden` when powered on) and
 wedged on the `fixed` container, which is exactly the size of the
 button — otherwise the pad would be trimmed while it works. */}
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
