import type { Transition } from "framer-motion";

/** Shared motion tuning, mirrored from AutoKap (lib/motion.ts). */
export const transitions = {
  spring: { type: "spring", stiffness: 400, damping: 30 } as Transition,
  gentle: { type: "spring", stiffness: 300, damping: 25 } as Transition,
  snappy: { type: "spring", stiffness: 500, damping: 35 } as Transition,
  fade: { duration: 0.15, ease: "easeOut" } as Transition,
};
