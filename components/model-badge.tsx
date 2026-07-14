"use client";

import { cn } from "mangue-ui";
import { ModelLogo } from "@/components/model-logo";
import { formatModelName } from "@/lib/model-display";

/**
 * Badge d'un modèle IA (MIN-46) : vrai logo du provider (`ModelLogo`) + nom
 * complet lisible ("DeepSeek V4 Flash"). Le titre au survol montre l'id brut
 * OpenRouter.
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
    <span
      title={model}
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border/60 bg-muted px-2 py-0.5 text-xs font-medium text-foreground/80",
        className,
      )}
    >
      <ModelLogo model={model} size={size} />
      <span className="truncate">{name}</span>
    </span>
  );
}
