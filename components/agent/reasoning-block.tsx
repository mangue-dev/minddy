"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, cn } from "mangue-ui";
import { Brain } from "lucide-react";

/**
 * Le modèle RÉFLÉCHIT (MIN-122). Ligne compacte calquée sur `ToolCallRow`
 * (components/assistant/tool-call-display.tsx) : même gabarit, même densité —
 * une étape de travail parmi les autres, pas un message.
 *
 * Ce qu'on NE fait pas : streamer le raisonnement. Il s'écrivait autrefois en
 * direct dans le fil, ce qui noyait le vrai déroulé sous des pages de monologue.
 * Pendant la réflexion, il n'y a donc qu'un libellé qui respire et un compteur de
 * secondes à droite ; la trace, elle, arrive avec l'event de fin de round et se
 * déplie à la demande.
 *
 * Le compteur n'a PAS d'horloge propre (ni `setInterval`, ni le `useNow` de
 * `WorkAccordion`) : `durationMs` est mesuré côté serveur et re-diffusé ~4 fois
 * par seconde pendant la réflexion — le composant n'a qu'à l'afficher. Une horloge
 * locale ferait diverger le compteur de la durée réellement persistée, et
 * continuerait de tourner sur un round déjà fini.
 */
export function ReasoningBlock({
  /** Réflexion EN COURS : libellé qui respire, compteur qui tourne. */
  active,
  /** Millisecondes de réflexion : mesurées côté serveur, ou le dernier direct reçu. */
  durationMs,
  /** Trace persistée, dépliable une fois le round fini. Vide = rien à déplier. */
  text,
}: {
  active: boolean;
  durationMs: number;
  text?: string;
}) {
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(false);

  const seconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(seconds / 60);
  const counter =
    minutes > 0
      ? t("reasoningForMinutes", { minutes, seconds: seconds % 60 })
      : t("reasoningForSeconds", { seconds });

  const trace = (text ?? "").trim();
  const expandable = !active && trace.length > 0;

  const row = (
    <div className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground">
      <Brain className="size-3 shrink-0" />
      <span className={cn("flex-1 truncate text-left", active && "text-shimmer")}>
        {t("reasoning")}
      </span>
      {/* Compteur à DROITE de la ligne — tabulaire, pour qu'il ne danse pas en
          changeant de chiffre. */}
      <span className="shrink-0 tabular-nums">{counter}</span>
    </div>
  );

  if (!expandable) return row;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full outline-hidden transition-colors hover:text-foreground">
        {row}
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=open]:animate-[collapsible-down_220ms_ease-out]">
        <p className="ml-5 whitespace-pre-wrap py-1 text-xs text-muted-foreground">{trace}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}
