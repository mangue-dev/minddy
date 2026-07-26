"use client";

import { Tooltip, TooltipContent, TooltipTrigger, cn } from "mangue-ui";
import { ModelLogo } from "@/components/model-logo";
import { formatModelName } from "@/lib/model-display";

/**
 * Badge d'un modèle IA (MIN-46) : vrai logo du provider (`ModelLogo`) + nom
 * complet lisible ("DeepSeek V4 Flash"). L'id brut OpenRouter reste accessible
 * au survol — c'est ce qu'on copie dans une config ou qu'on cherche dans un
 * log, mais ce n'est pas ce qu'on lit.
 */
export function ModelBadge({
  model,
  className,
  size = 14,
}: {
  model: string | null | undefined;
  className?: string;
  size?: number;
}) {
  if (!model) return null;
  const name = formatModelName(model);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border/60 bg-muted px-2 py-0.5 text-xs font-medium text-foreground/80",
            className,
          )}
        >
          <ModelLogo model={model} size={size} />
          <span className="truncate">{name}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="font-mono">{model}</TooltipContent>
    </Tooltip>
  );
}
