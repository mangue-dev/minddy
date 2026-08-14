import type { BrowserWindow } from "electron";

import { hideWindowStep } from "@/lib/desktop/hide-window";
import { trace } from "./trace";

/**
 * Cacher la fenêtre — le SEUL chemin (MIN-353).
 *
 * Trois gestes y mènent et ils doivent se comporter pareil : le feu rouge
 * (`close`, intercepté dans main.ts), ⌘W (menu.ts), et tout ce qu'on y
 * ajouterait. Un `window.hide()` écrit en direct quelque part, c'est le bug du
 * plein écran qui revient à cet endroit-là seulement — c'est exactement comme ça
 * qu'il a survécu à sa première correction.
 *
 * La règle est dans `lib/desktop/hide-window.ts`, avec la raison. Ici, le
 * câblage : `leave-full-screen` est le seul moment où macOS a fini de refermer
 * le Space, donc le seul où cacher est sans effet de bord.
 */
export function hideWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) return;

  const step = hideWindowStep({
    platform: process.platform,
    fullScreen: window.isFullScreen(),
  });
  trace("hideWindow", { step });

  if (step === "hide") {
    window.hide();
    return;
  }

  // `once` : la sortie de plein écran arrive aussi quand quelqu'un appuie sur
  // Échap ou reprend la fenêtre par le menu Présentation. Un abonnement
  // permanent cacherait la fenêtre à chacune de ces sorties-là.
  window.once("leave-full-screen", () => {
    // La transition dure le temps d'une animation ; ⌘Q peut tomber pendant
    // (`before-quit` détruit la fenêtre), et on n'appelle rien sur un objet mort.
    if (!window.isDestroyed()) window.hide();
  });
  window.setFullScreen(false);
}
