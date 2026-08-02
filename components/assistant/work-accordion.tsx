"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNow, useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "mangue-ui";
import { ChevronRight } from "lucide-react";

/**
 * Déroulé repliable du travail d'un TOUR, partagé par le chat Numo et le fil de
 * l'agent de code — une seule mécanique, une seule apparence :
 *  • ACTIF → ouvert par défaut, en-tête « Travaille depuis X » qui compte en direct.
 *  • terminé → l'en-tête devient « A travaillé pendant X » et l'accordéon se
 *    referme automatiquement (restant repliable/dépliable à la main).
 *
 * L'appelant rend la RÉPONSE du tour juste en dessous : le lecteur suit le travail
 * en cours, puis lit le message final, au lieu de recevoir le tour d'un bloc.
 *
 * À monter avec une `key` STABLE entre l'état actif et l'état terminé du même tour :
 * c'est la même instance qui joue l'animation de fermeture.
 *
 * Les libellés vivent dans le namespace i18n `Agent` : une seule source pour les
 * deux surfaces.
 */
export function WorkAccordion({
  startedAt,
  endedAt,
  active,
  children,
}: {
  /** ISO — début du tour. */
  startedAt: string;
  /** ISO — fin du tour ; `null` tant qu'il travaille. */
  endedAt: string | null;
  active: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("Agent");

  // Ouvert par défaut tant que ça TRAVAILLE ; se referme automatiquement au
  // passage travail → terminé, tout en restant repliable à la main.
  const [open, setOpen] = useState(active);
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) setOpen(false);
    wasActive.current = active;
  }, [active]);

  // Chrono : compte en direct (tick 1 s) tant qu'actif, sinon durée figée.
  const now = useNow({ updateInterval: active ? 1000 : undefined });
  const startMs = Date.parse(startedAt);
  const safeStart = Number.isNaN(startMs) ? now.getTime() : startMs;
  const ms = active
    ? Math.max(0, now.getTime() - safeStart)
    : Math.max(0, Date.parse(endedAt ?? startedAt) - safeStart);
  const totalSec = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const label = active
    ? minutes > 0
      ? t("workingSinceMinutes", { minutes, seconds })
      : t("workingSinceSeconds", { seconds })
    : minutes > 0
      ? t("workedForMinutes", { minutes, seconds })
      : t("workedForSeconds", { seconds });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 pb-2.5 text-xs font-medium text-muted-foreground outline-hidden transition-colors hover:text-foreground">
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        <span className={cn(active && "text-shimmer")}>{label}</span>
      </CollapsibleTrigger>
      {/* Bordure fixe pleine largeur sous le toggle : sépare l'indicateur des
          messages. Toujours visible (ouvert comme fermé), elle ne se déplace pas —
          le contenu s'anime en dessous. */}
      <div className="border-t border-border" />
      <CollapsibleContent>
        <div className="flex flex-col gap-3 pt-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
