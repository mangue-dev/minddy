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
import { ProviderLogo } from "@/components/model-logo";
import { formatModelName } from "@/lib/model-display";
import {
  useByokModelsQuery,
} from "@/lib/use-byok-models-query";
import type { ByokCatalogProvider } from "@/lib/byok-model-catalog";
import type { ModelCatalogCapability } from "@/lib/model-catalog-capability";

/**
 * Searchable picker for a NATIVE BYOK model id (MIN-416). Replaces the old
 * free-text input of `/admin` → “Models”: the catalog depends on the chosen
 * provider and comes from the public OpenRouter index — it works with no
 * provider API key configured at all.
 *
 * Free entry stays available (`useCustomLabel`): OpenRouter may not mirror
 * everything a native endpoint serves, and an id pasted by hand must remain
 * writable. The capability prop keeps text, transcription, and embedding
 * families separated.
 * The “default” option clears the setting — it then follows the product
 * fallback instead of being pinned to its current value.
 */
export function ByokModelCombobox({
  provider,
  capability = "text",
  value,
  defaultLabel,
  onChange,
  disabled,
  placeholder,
  useCustomLabel,
  loadingLabel,
}: {
  provider: ByokCatalogProvider;
  /** Runtime capability required by this configuration row. */
  capability?: ModelCatalogCapability;
  /** Native id, or "" = follows the product default. */
  value: string;
  defaultLabel: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
  /** Wording of the “use as is” row (free entry). */
  useCustomLabel: (query: string) => string;
  loadingLabel: string;
}) {
  const { models, loading } = useByokModelsQuery(provider, capability);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return models.slice(0, 50);
    return models
      .map((m) => ({ m, score: commandFilter(`${formatModelName(m.id)} ${m.id}`, q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map((r) => r.m);
  }, [models, query]);

  const trimmed = query.trim();
  const showFreeText = trimmed.length > 0 && !models.some((m) => m.id === trimmed);

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
              <ProviderLogo provider={provider} />
              <span className="truncate">{formatModelName(value)}</span>
            </span>
          ) : (
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <ProviderLogo provider={provider} />
              <span className="truncate">{defaultLabel}</span>
            </span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* Same width ceiling as `ModelCombobox`: a long native id must not leave the screen. */}
      <PopoverContent
        className="rounded-xl p-0 max-w-[min(30rem,calc(100vw-2rem))]"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} />
          <CommandList className="p-1">
            <CommandItem value="__default__" onSelect={() => select("")}>
              <ProviderLogo provider={provider} />
              <span className="flex-1 truncate text-muted-foreground">{defaultLabel}</span>
              <Check className={cn("size-4 shrink-0", value ? "opacity-0" : "opacity-100")} />
            </CommandItem>
            {results.map((m) => (
              <CommandItem key={m.id} value={m.id} onSelect={() => select(m.id)}>
                <ProviderLogo provider={provider} />
                <span className="flex-1 truncate">{formatModelName(m.id) || m.id}</span>
                <Check
                  className={cn("size-4 shrink-0", value === m.id ? "opacity-100" : "opacity-0")}
                />
              </CommandItem>
            ))}
            {showFreeText ? (
              <CommandItem value={`__free__${trimmed}`} onSelect={() => select(trimmed)}>
                <ProviderLogo provider={provider} />
                <span className="flex-1 truncate">{useCustomLabel(trimmed)}</span>
              </CommandItem>
            ) : null}
            {!loading && results.length === 0 && !showFreeText && trimmed.length === 0 ? (
              <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                {loadingLabel}
              </p>
            ) : null}
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Spinner className="size-4" />
                {loadingLabel}
              </div>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
