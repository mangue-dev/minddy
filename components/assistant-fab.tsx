"use client";

import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "mangue-ui";
import { Kbd, KbdSequence } from "@/components/ui/kbd";
import { NumoIcon } from "@/components/numo-icon";
import { AgentBeam } from "@/components/agent-beam";
import { ScratchpadTrigger } from "@/components/scratchpad/scratchpad-trigger";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { useAssistantBusy } from "@/lib/assistant-chat-context";
import { useChordPrefix, CHORD_PREFIX } from "@/lib/keyboard/keyboard-context";
import { transitions } from "@/lib/motion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Chrome-style bottom-right chrome buttons of the band: Numo's opener first,
 * the task-notebook ("chrome" pill) right after. Always visible.
 *
 * Closing the panel during a turn no longer stops Numo (the conversation lives in
 * AssistantChatProvider): the Numo button then carries the shared animated border of the app
 * as long as it works, and becomes inert again as soon as it is finished. It's his ONLY
 * signal — no context badge: what Numo is looking at can be read in the
 * panel, above the composer, not on the button that opens it.
 */

export function AssistantFab() {
  const { toggle } = useAssistantPanel();
  // The boolean alone, not the entire conversation context (MIN-323): `state`
  // changes with each SSE token, and the button returns at this rate
  // to read a value that only moves twice per revolution.
  const isBusy = useAssistantBusy();
  const chordArmed = useChordPrefix() === CHORD_PREFIX;
  const t = useTranslations("Assistant");
  const tk = useTranslations("Keyboard");

  return (
    <AnimatePresence>
      {(
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
            "fixed z-40 flex items-center gap-1",
            // Badged into the bottom chrome band (Linear-style): flush with the
            // panel's inset, vertically centered in the band itself.
            "right-3 bottom-1",
            "pb-[env(safe-area-inset-bottom)]",
          )}
        >
          <div className="relative">
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
                    whileTap={{ scale: 0.97, transition: transitions.snappy }}
                    className={cn(
                      // Chrome-style pill on the band surface: Numo's face and the
                      // product name, like Linear's bottom-right agent button.
                      "relative inline-flex items-center gap-2 rounded-full",
                      "h-7 px-2.5",
                      "text-sidebar-foreground/70 hover:text-sidebar-foreground",
                      "hover:bg-sidebar-accent/70",
                      "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "cursor-pointer",
                    )}
                  >
                    {/* `animated={false}` (MIN-323): the face animated
 SVG attributes loop, including masking under 768 px
 (`max-desktop:hidden` mask without unmounting). The activity signal
 already passes through the `AgentBeam` above. */}
                    <NumoIcon animated={false} className="size-4" />
                    <span className="text-[13px] font-medium leading-none">Numo</span>
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
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
 wedged on this relative wrapper, which is exactly the size of the
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
          </div>
          <ScratchpadTrigger variant="chrome" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
