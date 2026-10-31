import type { Transition } from "framer-motion";

/** Shared motion tuning, mirrored from AutoKap (lib/motion.ts). */
export const transitions = {
  spring: { type: "spring", stiffness: 400, damping: 30 } as Transition,
  gentle: { type: "spring", stiffness: 300, damping: 25 } as Transition,
  snappy: { type: "spring", stiffness: 500, damping: 35 } as Transition,
  fade: { duration: 0.15, ease: "easeOut" } as Transition,
  /**
   * The sliding of a PANEL INSIDE the sidebar: a level swap, the recalled
   * navigation block. A long ease-out rather than a spring (MIN-877): the
   * former spring covered most of its travel in its first frames and read
   * as a jump. The panel glides 340ms and settles softly, while its opacity
   * crosses faster so the two panels never read as stacked.
   */
  panel: {
    duration: 0.34,
    ease: [0.22, 1, 0.36, 1],
    opacity: { duration: 0.22, ease: "easeOut" },
  } as Transition,
  /**
 * The sliding of the CHASSIS: width of the primary sidebar, gutter of the
 * secondary sidebar, and by extension everything that is to their right — header,
 * breadcrumbs, content. All three MUST share this curve, otherwise their
 * edges shift between them during travel instead of sliding as a block.
 *
 * A duration rather than a spring: a spring overshoots its target, and an overhanging width
 * layout causes the entire right half to jolt de
 * the screen. The curve starts quickly and settles gently.
 */
  // 280ms, in step with the CSS widths and margin that travel with it
  // (sidebar-nav-overlay.tsx, app-top-bar.tsx, globals.css): slow enough to
  // follow the panel with the eye.
  shell: { duration: 0.28, ease: [0.32, 0.72, 0, 1] } as Transition,
};
