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
import { AgentBeam } from "@/components/agent-beam";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { useAssistantChatContext } from "@/lib/assistant-chat-context";
import { useChordPrefix, CHORD_PREFIX } from "@/lib/keyboard/keyboard-context";

/**
 * Minimal circular FAB that opens the global assistant panel. Hover reveals a
 * tooltip with the label — no permanent label. Hides while the panel is open.
 *
 * Fermer le panneau pendant un tour n'arrête plus Numo (la conversation vit dans
 * AssistantChatProvider) : le FAB porte alors le liseré animé partagé de l'app
 * tant que ça travaille, et redevient inerte dès que c'est fini. C'est son SEUL
 * signal — pas de pastille de contexte : ce que Numo regarde se lit dans le
 * panneau, au-dessus du composer, pas sur le bouton qui l'ouvre.
 */
export function AssistantFab() {
  const { isOpen, toggle } = useAssistantPanel();
  const { isBusy } = useAssistantChatContext();
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
          {/* `keepMounted` : le bouton ne doit pas être remonté quand le liseré
              s'allume ou s'éteint — sinon son animation d'entrée rejouerait à
              chaque bascule. */}
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
          {/* G-chord armed: surface the completion key (G then A). Posé HORS du
              liseré (dont le wrapper est `overflow: hidden` à l'allumage) et
              calé sur le conteneur `fixed`, qui a exactement la taille du
              bouton — sinon la pastille serait rognée pendant que ça travaille. */}
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
