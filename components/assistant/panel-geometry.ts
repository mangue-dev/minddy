import { cn } from "mangue-ui";

/**
 * Shared geometry of Numo's floating panel: compact widget style
 * anchored at the corner, or extended modal centered, with the transition `.assistant-
 * panel-morph` (voir globals.css) qui interpole right/bottom/width/height/radius.
 * Reused by Numo chat (AssistantPanel) AND the conversational modal of
 * the code agent (AgentChatModal, MIN-46) to guarantee an identical shell.
 */

export type PanelDisplayMode = "compact" | "expanded";

// Compact: anchored at the bottom right (corner of the FAB), very rounded corners.
const COMPACT_DESKTOP =
  "md:!inset-auto md:!top-auto md:!left-auto md:!right-4 md:!bottom-4 " +
  // `assistant-panel-anchor` re-docks right/bottom to shell corner centered on
  // ultrawide (see globals.css); the extension does not carry it and remains centered
  // on the viewport.
  "assistant-panel-anchor " +
  "md:!w-[min(450px,calc(100vw-24px))] md:!max-w-none " +
  "md:!h-[min(600px,calc(100dvh-32px))] " +
  "md:rounded-[30px] md:border md:border-l md:origin-bottom-right";

// Expanded: centered, LARGE format — exactly the geometry of the modals of
// reading the app (task book, project creation), which are sized
// all on the `--spacing-dialog-w/h` tokens of mango-ui. Same bias as
// the AutoKap Numo panel: one “large surface” size for everything
// the product, instead of a half-size specific to the assistant.
const EXPANDED_DESKTOP =
  "md:!inset-auto md:!top-auto md:!left-auto " +
  "md:!right-[calc((100vw-var(--spacing-dialog-w))/2)] " +
  "md:!bottom-[calc((100dvh-var(--spacing-dialog-h))/2)] " +
  "md:!w-[var(--spacing-dialog-w)] md:!max-w-none " +
  "md:!h-[var(--spacing-dialog-h)] " +
  "md:rounded-2xl md:border md:origin-center";

/** Classes of the panel's SheetContent, depending on the display mode. */
export function panelSheetClassName(displayMode: PanelDisplayMode): string {
  return cn(
    "p-0 gap-0",
    // No focus halo on the shell: the Radix FocusScope rests on the
    // focus on the content of the Sheet as soon as it escapes (e.g. the input emptied after
    // sending), which triggered the browser's default white outline
    // around the entire panel. Same bias as DialogContent (mango-ui).
    "outline-none",
    // Compact ⇄ extended fluid morph — see globals.css `.assistant-panel-morph`.
    "assistant-panel-morph",
    displayMode === "expanded" ? EXPANDED_DESKTOP : COMPACT_DESKTOP,
    "md:data-open:!slide-in-from-right-0 md:data-closed:!slide-out-to-right-0",
    "md:data-open:zoom-in-95 md:data-closed:zoom-out-95",
    "md:shadow-[0_20px_50px_-15px_rgba(0,0,0,0.35),0_4px_12px_-4px_rgba(0,0,0,0.12)]",
    // Mobile: almost full screen with a slight inset (floating map).
    "max-md:!inset-2 max-md:!h-auto max-md:!w-auto max-md:!max-w-none",
    "max-md:rounded-[30px] max-md:border",
    "max-md:pb-[env(safe-area-inset-bottom)]",
  );
}

/** Overlay classes: transparent in compact (widget), scrim in extended (modal). */
export function panelOverlayClassName(displayMode: PanelDisplayMode): string {
  return cn(
    "transition-[background-color,backdrop-filter] !duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
    displayMode === "compact" &&
      "!bg-transparent supports-backdrop-filter:!backdrop-blur-none",
  );
}
