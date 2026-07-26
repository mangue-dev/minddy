"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Button,
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  commandFilter,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "mangue-ui";
import { ModelLogo, ProviderLogo } from "@/components/model-logo";
import { formatModelName } from "@/lib/model-display";
import {
  useAgentModelsQuery,
  type AgentModelsScope,
} from "@/lib/use-agent-models-query";

/**
 * Picker de modèle recherchable de l'agent (MIN-46). Recherche dans le catalogue
 * du provider ACTIF (BYOK ou clé plateforme), chaque entrée avec son logo et son
 * nom reformaté (`formatModelName`). `value` vaut "" pour « mon défaut », sinon
 * l'id du modèle. Saisie libre autorisée (`freeTextLabel`) : indispensable pour
 * un provider générique dont `/models` peut être vide/indisponible. On
 * filtre/score nous-mêmes (`shouldFilter={false}`) et on tronque à MAX_RESULTS.
 */

const MAX_RESULTS = 50;

export function ModelCombobox({
  value,
  onChange,
  defaultLabel,
  defaultModelId,
  placeholder,
  emptyLabel,
  loadingLabel,
  freeTextLabel,
  disabled,
  disabledTooltip,
  variant = "field",
  scope = "user",
}: {
  /** "" = suit mon modèle par défaut ; sinon un id de modèle. */
  value: string;
  onChange: (value: string) => void;
  defaultLabel: string;
  /** Modèle vers lequel « le défaut » résout (affiché en aparté sur l'option défaut). */
  defaultModelId?: string | null;
  placeholder: string;
  emptyLabel: string;
  loadingLabel: string;
  /** Libellé de l'option « utiliser tel quel » (saisie libre). */
  freeTextLabel: (query: string) => string;
  disabled?: boolean;
  /**
   * Tooltip affiché quand le picker est verrouillé (variante `compact`) : le modèle
   * est figé pour la session, ex. « pour en changer, lancez un nouvel agent ».
   */
  disabledTooltip?: string;
  /**
   * `field` (défaut) : trigger pleine largeur façon champ de formulaire.
   * `compact` : petit pill (logo + nom) pour la barre d'un composer de chat.
   */
  variant?: "field" | "compact";
  /**
   * Catalogue interrogé. `user` (défaut) = le provider actif du compte ;
   * `platform` = la clé plateforme OpenRouter, pour la config admin.
   */
  scope?: AgentModelsScope;
}) {
  const { provider, models, loading } = useAgentModelsQuery(scope);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return models.slice(0, MAX_RESULTS);
    return models
      .map((m) => ({ m, score: commandFilter(`${formatModelName(m.id)} ${m.id}`, q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((r) => r.m);
  }, [models, query]);

  // Logo : OpenRouter → par id (`vendor/model`) ; sinon logo du provider actif.
  const logoFor = (modelId: string) =>
    provider === "openrouter" ? (
      <ModelLogo model={modelId} />
    ) : (
      <ProviderLogo provider={provider} />
    );

  const trimmed = query.trim();
  const showFreeText = trimmed.length > 0 && !models.some((m) => m.id === trimmed);

  const select = (next: string) => {
    onChange(next);
    setQuery("");
    setOpen(false);
  };

  // Rendu de l'option « défaut » : libellé + modèle résolu (logo + nom) en aparté.
  const defaultRow = (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      {defaultModelId ? logoFor(defaultModelId) : null}
      <span className="truncate text-muted-foreground">{defaultLabel}</span>
      {defaultModelId ? (
        <span className="truncate text-xs text-muted-foreground/70">
          {formatModelName(defaultModelId)}
        </span>
      ) : null}
    </span>
  );

  // Verrouillé (agent lancé) : chip statique + tooltip, SANS popover. Le <span>
  // extérieur porte le hover (un bouton `disabled` n'émet pas d'événement pointer,
  // donc le tooltip ne s'ouvrirait pas si on le mettait sur le bouton).
  if (variant === "compact" && disabled && disabledTooltip) {
    const shown = value || defaultModelId || "";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">
            <span className="pointer-events-none flex h-8 shrink items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 text-xs font-medium text-foreground/45">
              {shown ? logoFor(shown) : null}
              <span className="max-w-[9rem] truncate">
                {shown ? formatModelName(shown) : defaultLabel}
              </span>
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{disabledTooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        {variant === "compact" ? (
          <Button
            type="button"
            variant="ghost"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-8 shrink gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 text-xs font-medium text-foreground/80 hover:bg-muted"
          >
            {value
              ? logoFor(value)
              : defaultModelId
                ? logoFor(defaultModelId)
                : null}
            <span className="max-w-[9rem] truncate">
              {/* Toujours le nom réel du modèle : même quand on suit « le défaut »,
                  on affiche le modèle résolu (fallback sur le libellé si inconnu). */}
              {value
                ? formatModelName(value)
                : defaultModelId
                  ? formatModelName(defaultModelId)
                  : defaultLabel}
            </span>
            <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            {value ? (
              <span className="flex min-w-0 items-center gap-2">
                {logoFor(value)}
                <span className="truncate">{formatModelName(value)}</span>
              </span>
            ) : (
              defaultRow
            )}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "p-0",
          variant === "compact" ? "w-80" : "w-[var(--radix-popover-trigger-width)]"
        )}
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} />
          {/* mt-1.5 : respire sous l'input ; px-1 : aligne la largeur des options
              sur celle du champ de recherche (même retrait de 8px des bords). */}
          <CommandList className="mt-1.5 px-1">
            <CommandItem value="__default__" onSelect={() => select("")}>
              {defaultRow}
              <Check className={cn("size-4 shrink-0", value ? "opacity-0" : "opacity-100")} />
            </CommandItem>
            {results.map((m) => (
              <CommandItem key={m.id} value={m.id} onSelect={() => select(m.id)}>
                {logoFor(m.id)}
                <span className="flex-1 truncate">{formatModelName(m.id)}</span>
                <Check
                  className={cn("size-4 shrink-0", value === m.id ? "opacity-100" : "opacity-0")}
                />
              </CommandItem>
            ))}
            {showFreeText ? (
              <CommandItem value={`__free__${trimmed}`} onSelect={() => select(trimmed)}>
                {logoFor(trimmed)}
                <span className="flex-1 truncate">{freeTextLabel(trimmed)}</span>
                <Check
                  className={cn("size-4 shrink-0", value === trimmed ? "opacity-100" : "opacity-0")}
                />
              </CommandItem>
            ) : null}
            {results.length === 0 && !showFreeText ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                {loading ? (
                  <>
                    <Spinner />
                    {loadingLabel}
                  </>
                ) : (
                  emptyLabel
                )}
              </div>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
