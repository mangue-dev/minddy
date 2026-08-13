"use client";

import { cn } from "mangue-ui";
import { ModelLogo } from "@/components/model-logo";
import { formatModelName } from "@/lib/model-display";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Badge d'un modèle IA (MIN-46) : vrai logo du provider (`ModelLogo`) + nom
 * complet lisible ("DeepSeek V4 Flash").
 *
 * Par défaut, l'id brut OpenRouter reste accessible au survol — c'est ce qu'on
 * copie dans une config ou qu'on cherche dans un log, mais ce n'est pas ce
 * qu'on lit. Là où le badge n'est PAS une donnée technique à recopier mais un
 * réglage à comprendre, `tooltip` remplace cet id par une phrase.
 */
export function ModelBadge({
  model,
  className,
  size = 14,
  fallbackLabel,
  tooltip,
}: {
  model: string | null | undefined;
  className?: string;
  size?: number;
  /**
   * Ce que le badge dit quand AUCUN modèle n'est fixé — une routine qui suit le
   * défaut de son propriétaire (MIN-185). Sans lui, le badge disparaît : c'est
   * le bon choix là où le modèle est une donnée du run (il y en a toujours un),
   * et le mauvais là où son absence EST l'information.
   */
  fallbackLabel?: string;
  /**
   * Remplace l'id brut au survol par une phrase qui dit ce que ce badge EST.
   * C'est aussi la seule façon d'avoir une infobulle sur le badge de repli :
   * sans modèle fixé, il n'y a aucun id à révéler.
   */
  tooltip?: string;
}) {
  const chip = cn(
    "inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border/60 bg-muted px-2 py-0.5 text-xs font-medium text-foreground/80",
    className,
  );

  const label = model ? formatModelName(model) : fallbackLabel;
  if (!label) return null;

  const badge = (
    <span className={chip}>
      <ModelLogo model={model} size={size} />
      <span className="truncate">{label}</span>
    </span>
  );

  // Rien à survoler quand il n'y a ni phrase fournie ni id à révéler.
  const content = tooltip ?? model;
  if (!content) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      {/* La fonte à chasse fixe est celle d'un id qu'on recopie ; une phrase se
          lit dans la fonte du produit. */}
      <TooltipContent className={tooltip ? undefined : "font-mono"}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
