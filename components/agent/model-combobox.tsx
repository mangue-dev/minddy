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
} from "mangue-ui";
import { ModelLogo } from "@/components/model-logo";
import { formatModelName } from "@/lib/model-display";
import { useAgentModelsQuery } from "@/lib/use-agent-models-query";

/**
 * Picker de modèle recherchable de l'agent (MIN-46). Remplace le `Select` figé à
 * 3 modèles : recherche dans tout le catalogue OpenRouter (BYOK ou clé
 * plateforme, même liste), chaque entrée avec son logo (`ModelLogo`) et son nom
 * reformaté (`formatModelName`, sans provider ni tirets). `value` vaut "" pour
 * « mon défaut », sinon l'id OpenRouter brut. On filtre/score nous-mêmes
 * (`shouldFilter={false}`) et on tronque à MAX_RESULTS pour ne pas monter les
 * ~300 entrées du catalogue.
 */

const MAX_RESULTS = 50;

export function ModelCombobox({
  value,
  onChange,
  defaultLabel,
  placeholder,
  emptyLabel,
  loadingLabel,
  disabled,
}: {
  /** "" = suit mon modèle par défaut ; sinon un id OpenRouter `provider/model`. */
  value: string;
  onChange: (value: string) => void;
  defaultLabel: string;
  placeholder: string;
  emptyLabel: string;
  loadingLabel: string;
  disabled?: boolean;
}) {
  const { models, loading } = useAgentModelsQuery();
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

  const select = (next: string) => {
    onChange(next);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
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
              <ModelLogo model={value} />
              <span className="truncate">{formatModelName(value)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{defaultLabel}</span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} />
          <CommandList>
            <CommandItem value="__default__" onSelect={() => select("")}>
              <span className="flex-1 truncate">{defaultLabel}</span>
              <Check className={cn("size-4 shrink-0", value ? "opacity-0" : "opacity-100")} />
            </CommandItem>
            {results.map((m) => (
              <CommandItem key={m.id} value={m.id} onSelect={() => select(m.id)}>
                <ModelLogo model={m.id} />
                <span className="flex-1 truncate" title={m.id}>
                  {formatModelName(m.id)}
                </span>
                <Check
                  className={cn("size-4 shrink-0", value === m.id ? "opacity-100" : "opacity-0")}
                />
              </CommandItem>
            ))}
            {results.length === 0 ? (
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
