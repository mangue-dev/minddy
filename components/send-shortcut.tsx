"use client";

// Le raccourci d'ENVOI, dit une seule fois pour toute l'application.
//
// Partout où l'on écrit un message — le composer de Numo, un commentaire de
// ticket, une remarque de ligne sur une pull request, une réponse d'équipe, un
// retour public — c'est ⌘/Ctrl + Entrée qui l'envoie, et Entrée seule qui passe
// à la ligne. Un composer où l'on rédige plusieurs phrases ne peut pas partir
// sur la touche qui sert à respirer.
//
// Depuis MIN-287 c'est un DÉFAUT et non plus une loi : Compte → Préférences
// permet de mettre l'envoi sur Entrée seule. La légende suit donc le compte —
// et seulement là où la touche le suit aussi, d'où `scope` ci-dessous.
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
import { useSendMode } from "@/lib/keyboard/use-send-mode";
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

/**
 * De quel côté du réglage se trouve le bouton qu'on légende.
 *
 * - `composer` (le défaut) : un message — commentaire, réponse, prompt, retour.
 *   La préférence de compte s'y applique, la légende la suit ;
 * - `form` : un formulaire dont le corps est un ÉDITEUR (créer un ticket, un
 *   objectif, une vue, une étape de wizard). Entrée y appartient au paragraphe
 *   suivant quoi qu'ait choisi le compte, donc la légende reste « ⌘ ↵ ».
 */
export type SendShortcutScope = "composer" | "form";

/** La ou les touches d'envoi, telles que les porte le clavier de la plateforme
    et telles que les a réglées le compte. */
export function SendShortcutKeys({
  size = "sm",
  scope = "composer",
}: {
  size?: "sm" | "default";
  scope?: SendShortcutScope;
}) {
  const mod = useModKey();
  const mode = useSendMode();
  // Entrée seule : une seule pastille. Dire « ⌘ ↵ » à qui a choisi Entrée
  // serait exact (⌘↵ envoie aussi) mais lui apprendrait le geste le plus long.
  if (scope === "composer" && mode === "enter") {
    return <Kbd size={size}>↵</Kbd>;
  }
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
  scope = "composer",
  children,
}: {
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  scope?: SendShortcutScope;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        <span className="inline-flex items-center gap-1.5">
          {label}
          <SendShortcutKeys scope={scope} />
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
