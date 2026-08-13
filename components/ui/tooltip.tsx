"use client";

import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger as MangueTooltipTrigger,
} from "mangue-ui";
import {
  createWindowRefocusTracker,
  shouldOpenTooltipOnFocus,
} from "@/lib/tooltip-focus";

/**
 * L'infobulle de minddy — celle de `mangue-ui`, moins son ouverture au focus
 * subie.
 *
 * Radix ouvre l'infobulle sur tout `focus` du déclencheur. Le navigateur rend
 * le focus tout seul quand l'onglet redevient actif : des infobulles se
 * rouvraient sur des boutons que personne n'avait survolés, au retour d'un
 * autre onglet. Le pourquoi, et les deux règles qui le corrigent, sont écrits
 * dans [lib/tooltip-focus.ts](../../lib/tooltip-focus.ts).
 *
 * **Importer l'infobulle d'ICI, jamais de `mangue-ui`** : un `TooltipTrigger`
 * pris en amont réintroduit le défaut, silencieusement, sur cette surface-là
 * seulement. Le reste (`Tooltip`, `TooltipContent`, `TooltipProvider`) est
 * réexporté tel quel pour que l'import tienne en une ligne.
 *
 * DOUBLON TEMPORAIRE, comme `@/components/ui/kbd` avant lui : la même garde est
 * désormais DANS le `TooltipTrigger` de mangue-ui (0.5.2, non publiée), là où
 * elle couvre aussi les infobulles que le paquet rend lui-même — celle du menu
 * « ⋯ » des tâches du carnet, par `SearchMenu`, que ce fichier ne peut pas
 * atteindre. À RETIRER dès que minddy consomme une version publiée qui la
 * porte : remplacer les imports par `mangue-ui` et supprimer ce fichier.
 */

const tracker = createWindowRefocusTracker();

if (typeof window !== "undefined") {
  // Onglet ou application quittés puis repris : le `focus` qui suit vient du
  // navigateur. `visibilitychange` double la mise — certains changements
  // d'onglet ne passent pas par le `focus` de la fenêtre.
  window.addEventListener("focus", tracker.markRefocus);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tracker.markRefocus();
  });
  // Un geste, et le focus reprend son sens habituel. En capture : le drapeau
  // doit tomber avant que le `focus` déclenché par ce même geste n'arrive.
  const gesture = () => tracker.markGesture();
  window.addEventListener("keydown", gesture, { capture: true });
  window.addEventListener("pointerdown", gesture, { capture: true });
}

/** Vrai si l'élément porte `:focus-visible`. Un navigateur qui ne connaîtrait
    pas le sélecteur lève sur `matches` — on retombe alors sur « visible »,
    c'est-à-dire sur le comportement d'avant. */
function isFocusVisible(element: Element): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return true;
  }
}

export function TooltipTrigger({
  onFocus,
  ...props
}: React.ComponentProps<typeof MangueTooltipTrigger>) {
  return (
    <MangueTooltipTrigger
      onFocus={(event) => {
        onFocus?.(event);
        if (event.defaultPrevented) return;
        const signal = {
          refocusPending: tracker.consumeRefocus(),
          focusVisible: isFocusVisible(event.currentTarget),
        };
        // `preventDefault` sur un événement synthétique React marque
        // `defaultPrevented` même si `focus` n'est pas annulable, et c'est ce
        // que lit le `composeEventHandlers` de Radix pour renoncer à ouvrir.
        // L'élément garde son focus : seule l'infobulle est retenue.
        if (!shouldOpenTooltipOnFocus(signal)) event.preventDefault();
      }}
      {...props}
    />
  );
}

export { Tooltip, TooltipContent, TooltipProvider };
