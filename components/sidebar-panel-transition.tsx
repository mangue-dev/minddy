"use client";

import { useState, type ReactNode } from "react";
import { motion, useIsPresent, type Transition, type Variants } from "framer-motion";

/**
 * Which way a level swap travels: 1 descends (the incoming panel enters from
 * the right, the outgoing one leaves to the left), -1 climbs back (mirrored),
 * 0 swaps two panels of the same level (a project switch). A lateral swap
 * still travels, forward like a descent: every panel change reads as the
 * same horizontal slide, only its side changes.
 */
export type PanelDirection = -1 | 0 | 1;

/**
 * How far a panel travels while it fades in or out. The horizontal slide is
 * the swap's only motion (the rows do not move on their own), so it carries
 * a little more distance than a fade alone would need, and stays short.
 */
export const PANEL_OFFSET = 32;

/** The side a swap travels to: a lateral swap moves forward. */
export function panelTravel(direction: PanelDirection): -1 | 1 {
  return direction === -1 ? -1 : 1;
}

/**
 * The direction of the latest level swap, derived from the depth of the
 * panel on screen (home 0, then deeper levels) and its key: a deeper panel
 * descends, a shallower one climbs back, another key at the same depth (a
 * project switch) is lateral. Derived during render, so the swap that changes
 * the depth already plays in its own direction.
 */
export function usePanelDirection(depth: number, key: string): PanelDirection {
  const [state, setState] = useState({ depth, key, direction: 0 as PanelDirection });
  if (state.depth === depth && state.key === key) return state.direction;
  const direction = panelDirection(state.depth, depth);
  setState({ depth, key, direction });
  return direction;
}

export function panelDirection(fromDepth: number, toDepth: number): PanelDirection {
  return toDepth > fromDepth ? 1 : toDepth < fromDepth ? -1 : 0;
}

/**
 * The panel's own variants. `custom` is the swap direction: AnimatePresence
 * hands its LATEST value to the panel that is leaving, so a panel always
 * leaves in the direction of the swap that removes it, not of the one that
 * brought it.
 */
const panelVariants: Variants = {
  enter: (direction: PanelDirection) => ({ opacity: 0, x: panelTravel(direction) * PANEL_OFFSET }),
  center: { opacity: 1, x: 0 },
  exit: (direction: PanelDirection) => ({ opacity: 0, x: -panelTravel(direction) * PANEL_OFFSET }),
};

/**
 * The rows of an incoming panel arrive one after the other rather than as a
 * block: a short fade in place, its delay capped so a long list does not keep
 * the eye waiting. The rows never move on their own: the panel's horizontal
 * slide is the swap's only travel. Rows rendered outside a panel transition
 * (no parent variants) simply render.
 */
export const panelRowVariants: Variants = {
  enter: { opacity: 0 },
  center: (index: number) => ({
    opacity: 1,
    transition: index < 0
      ? { duration: 0 }
      : { duration: 0.22, ease: "easeOut", delay: 0.06 + Math.min(index, 10) * 0.018 },
  }),
};

/** Exiting panels can remain visible without covering the incoming controls. */
export function SidebarPanelTransition({
  className,
  direction,
  transition,
  children,
}: {
  className: string;
  direction: PanelDirection;
  transition: Transition;
  children: ReactNode;
}) {
  const present = useIsPresent();
  return (
    <motion.div
      className={className}
      inert={!present}
      aria-hidden={!present || undefined}
      style={{ pointerEvents: present ? undefined : "none" }}
      custom={direction}
      variants={panelVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={transition}
    >
      {children}
    </motion.div>
  );
}
