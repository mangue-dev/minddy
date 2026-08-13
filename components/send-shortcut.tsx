"use client";

// Le raccourci d'ENVOI, dit une seule fois pour toute l'application.
//
// Partout où l'on écrit un message — le composer de Numo, un commentaire de
// ticket, une remarque de ligne sur une pull request, une réponse d'équipe, un
// retour public — c'est ⌘/Ctrl + Entrée qui l'envoie, et Entrée seule qui passe
// à la ligne. Un composer où l'on rédige plusieurs phrases ne peut pas partir
// sur la touche qui sert à respirer.
//
// La contrepartie d'un envoi qui n'est plus sur Entrée, c'est qu'il ne se
// devine plus : le geste doit se LIRE au survol du bouton qui l'exécute. D'où
// ces deux composants plutôt qu'un `title` recopié dix fois — le jour où le
// raccourci change, il change ici.
//
// La touche suit la plateforme (`useModKey`) : « ⌘ » sur un Mac, « Ctrl »
// ailleurs. Deux pastilles séparées, comme la pill de recherche rend « ⌘ K » :
// « ⌘↵ » dans une seule se lirait comme une touche unique.

import type { ReactElement } from "react";
import { Kbd } from "@/components/ui/kbd";
import { useModKey } from "@/lib/keyboard/use-mod-shortcut";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Vrai si l'événement clavier est le raccourci d'envoi. Un seul endroit décide
    de ce qu'« envoyer au clavier » veut dire, côté touche comme côté légende —
    cet endroit est [lib/keyboard/send-shortcut.ts], réexporté ici pour que les
    surfaces qui rendent la légende n'aient qu'un import à faire. */
export { isSendShortcut } from "@/lib/keyboard/send-shortcut";

/** Les deux touches, telles que les porte le clavier de la plateforme. */
export function SendShortcutKeys({ size = "sm" }: { size?: "sm" | "default" }) {
  const mod = useModKey();
  return (
    <span className="inline-flex items-center gap-0.5">
      <Kbd size={size}>{mod}</Kbd>
      <Kbd size={size}>↵</Kbd>
    </span>
  );
}

/**
 * Le bouton d'envoi et sa légende : « Commenter ⌘ ↵ ».
 *
 * Le libellé est celui du bouton lui-même — la répétition est voulue, c'est ce
 * qui rend l'infobulle lisible seule et permet à un bouton en icône (le rond
 * d'envoi de Numo) d'utiliser exactement le même composant.
 *
 * Un `<button disabled>` natif n'émet plus d'événements de pointeur : sur un
 * bouton désactivé l'infobulle ne s'ouvre pas. C'est le bon comportement — le
 * raccourci n'enverrait rien non plus.
 */
export function SendShortcutTooltip({
  label,
  side = "top",
  children,
}: {
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        <span className="inline-flex items-center gap-1.5">
          {label}
          <SendShortcutKeys />
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
