import { cn } from "mangue-ui";

/**
 * Géométrie partagée du panneau flottant (Sheet) de Numo : compact façon widget
 * ancré au coin, ou étendu façon modal centrée, avec la transition `.assistant-
 * panel-morph` (voir globals.css) qui interpole right/bottom/width/height/radius.
 * Réutilisée par le chat Numo (AssistantPanel) ET la modal conversationnelle de
 * l'agent de code (AgentChatModal, MIN-46) pour garantir un shell identique.
 */

export type PanelDisplayMode = "compact" | "expanded";

// Compact : ancré en bas-droite (coin du FAB), coins très arrondis.
const COMPACT_DESKTOP =
  "md:!inset-auto md:!top-auto md:!left-auto md:!right-4 md:!bottom-4 " +
  // `assistant-panel-anchor` ré-ancre right/bottom au coin du shell centré sur
  // ultrawide (voir globals.css) ; l'étendu ne la porte pas et reste centré
  // sur le viewport.
  "assistant-panel-anchor " +
  "md:!w-[min(450px,calc(100vw-24px))] md:!max-w-none " +
  "md:!h-[min(600px,calc(100dvh-32px))] " +
  "md:rounded-[30px] md:border md:border-l md:origin-bottom-right";

// Étendu : centré, taille de modale de lecture.
const EXPANDED_DESKTOP =
  "md:!inset-auto md:!top-auto md:!left-auto " +
  "md:!right-[calc((100vw-min(56rem,100vw-4rem))/2)] " +
  "md:!bottom-[calc((100dvh-min(44rem,100dvh-4rem))/2)] " +
  "md:!w-[min(56rem,calc(100vw-4rem))] md:!max-w-none " +
  "md:!h-[min(44rem,calc(100dvh-4rem))] " +
  "md:rounded-2xl md:border md:origin-center";

/** Classes du SheetContent du panneau, selon le mode d'affichage. */
export function panelSheetClassName(displayMode: PanelDisplayMode): string {
  return cn(
    "p-0 gap-0",
    // Morph fluide compact ⇄ étendu — voir globals.css `.assistant-panel-morph`.
    "assistant-panel-morph",
    displayMode === "expanded" ? EXPANDED_DESKTOP : COMPACT_DESKTOP,
    "md:data-open:!slide-in-from-right-0 md:data-closed:!slide-out-to-right-0",
    "md:data-open:zoom-in-95 md:data-closed:zoom-out-95",
    "md:shadow-[0_20px_50px_-15px_rgba(0,0,0,0.35),0_4px_12px_-4px_rgba(0,0,0,0.12)]",
    // Mobile : quasi plein écran avec un léger inset (carte flottante).
    "max-md:!inset-2 max-md:!h-auto max-md:!w-auto max-md:!max-w-none",
    "max-md:rounded-[30px] max-md:border",
    "max-md:pb-[env(safe-area-inset-bottom)]",
  );
}

/** Classes de l'overlay : transparent en compact (widget), scrim en étendu (modal). */
export function panelOverlayClassName(displayMode: PanelDisplayMode): string {
  return cn(
    "transition-[background-color,backdrop-filter] !duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
    displayMode === "compact" &&
      "!bg-transparent supports-backdrop-filter:!backdrop-blur-none",
  );
}
