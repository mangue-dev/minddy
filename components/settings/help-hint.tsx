"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "mangue-ui";
import { Info } from "lucide-react";

/**
 * Le petit ⓘ qui ouvre l'explication détaillée — il SORT la prose des réglages.
 *
 * Un écran de réglages se lit d'un coup d'œil : ce qui est allumé, ce qui est
 * choisi, ce que ça coûte. Le paragraphe qui explique pourquoi a sa place, mais
 * pas entre l'interrupteur et le suivant — sinon on ne voit plus l'organisation
 * de la page, seulement du texte. Il vit donc ici, à un clic.
 *
 * Né dans les réglages Feedback, extrait pour les Automatisations : deux écrans
 * qui affichent la même chose doivent l'afficher pareil.
 */
export function HelpHint({ children }: { children: ReactNode }) {
  const t = useTranslations("Settings");
  return (
    <Popover>
      <PopoverTrigger
        aria-label={t("feedbackLearnMore")}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 outline-hidden transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-w-xs text-xs leading-relaxed text-muted-foreground"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
