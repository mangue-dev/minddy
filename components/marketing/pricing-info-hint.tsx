"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "mangue-ui/components/ui/popover";

/**
 * Le petit « i » des lignes du tableau tarifs : le détail d'une ligne se lit
 * à la demande, sans peser sur la ligne elle-même.
 *
 * Popover et non Tooltip, alors que le reste de l'app utilise Tooltip pour ce
 * geste : une infobulle Radix ne s'ouvre qu'au survol et au focus clavier, et
 * son déclencheur se ferme AU CLIC — au doigt, le « i » ne ferait donc rien du
 * tout et l'explication serait perdue pour tout le trafic mobile, qui est loin
 * d'être marginal sur une page de tarifs. Le popover, lui, s'ouvre au clic
 * comme au toucher ; le survol est rajouté par-dessus pour la souris, qui n'a
 * aucune raison de perdre l'ouverture immédiate.
 */
export function PricingInfoHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // Le texte EST l'information : sans lui ici, un lecteur d'écran
          // n'annoncerait qu'un bouton « i » sans contenu.
          aria-label={text}
          // Filtré sur la souris : au toucher, le navigateur synthétise un
          // survol juste avant le clic, et le popover se rouvrirait puis se
          // refermerait dans la même tape.
          onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
          className="inline-flex shrink-0 rounded-full text-muted-foreground/50 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        // Le focus ne doit ni entrer dans la bulle à l'ouverture, ni revenir se
        // poser sur le « i » à la fermeture : le survol l'ouvre et le referme
        // sans que personne n'ait rien demandé, et le comportement par défaut
        // laisserait un anneau de focus derrière chaque passage de souris. Au
        // clavier, rien n'est perdu : le focus n'a jamais quitté le bouton.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="max-w-[280px] text-xs leading-relaxed text-pretty text-muted-foreground"
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}
