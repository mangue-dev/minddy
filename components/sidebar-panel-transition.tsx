"use client";

import type { ReactNode } from "react";
import { motion, useIsPresent, type Transition } from "framer-motion";

/** Exiting panels can remain visible without covering the incoming controls. */
export function SidebarPanelTransition({
  className,
  offset,
  transition,
  children,
}: {
  className: string;
  offset: number;
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
      initial={{ opacity: 0, x: offset }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: offset }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}
