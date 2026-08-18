"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronsUpDown, ListPlus } from "lucide-react";
import {
  Button,
  Command,
  CommandGroup,
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
import { ModelLogo, ProviderLogo } from "@/components/model-logo";
import { formatModelName } from "@/lib/model-display";
import { formatMultiplier, isMultiplierWithinPlan } from "@/lib/model-multiplier";
import {
  useAgentModelsQuery,
  type AgentModel,
  type AgentModelsScope,
} from "@/lib/use-agent-models-query";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Agent Searchable Model Picker (MIN-46). Catalog search
 * of the ACTIVE provider (BYOK or platform key), each entry with its logo and its
 * reformatted name (`formatModelName`). `value` is "" for "my default", otherwise
 * the model id. Free entry authorized (`freeTextLabel`): essential for
 * a generic provider whose `/models` may be empty/unavailable. We
 * filter/score ourselves (`shouldFilter={false}`) and we truncate to MAX_RESULTS.
 *
 * WHEN OPENING, the list is not the catalog: it is the short selection of
 * RECOMMENDED models (`recommended`, set in /admin, cf.
 * lib/recommended-models.ts). Three hundred models arranged in alphabetical order
 * open on `agentica-org/…` — a rank that says nothing about what works, and
 * which leaves the entire choice up to someone who just wanted to launch a
 * agent. Nothing is HIDDEN though: type searches in the entire catalog, and
 * a last line opens it in full without typing anything. When the server does not
 * returns no applicable advice (BYOK to native ids, admin catalog, list
 * emptied), we fall back on the entire catalog — the behavior before.
 *
 * Each model carries its COST relative to the default minddy model (“×2.4”,
 * cf. lib/model-multiplier.ts), and those that exceed the plan ceiling are
 * GRAYED, not hidden: knowing that a model exists and what it costs is
 * precisely what gives a reason to change plans. The server refuses them
 * for its part (`ensureModelInPlan`) — the gray is a courtesy, not the lock.
 *
 * The two go together but do not depend on each other: the “×N”
 * is displayed as soon as the catalog locates the model, the gray only appears if it
 * ALSO sends a cap. This is what gives the dashboard its cost scale
 * admin, where you choose what minddy pays without any plan applying. In
 * BYOK, on ​​the other hand, the catalog does not locate anything at all and there is therefore nothing to
 * show: the user pays their own tokens, and a scale indexed to the
 * default minddy wouldn't talk about her bill.
 */

const MAX_RESULTS = 50;

/** Displayable name of a plan: its capitalized id (“go” → “Go”). */
function planLabel(id: string | null): string {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : "";
}

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
  /** "" = follows my default template; otherwise a model id. */
  value: string;
  onChange: (value: string) => void;
  defaultLabel: string;
  /** Model to which “the default” resolves (displayed separately on the default option). */
  defaultModelId?: string | null;
  placeholder: string;
  emptyLabel: string;
  loadingLabel: string;
  /** Wording of the “use as is” option (free entry). */
  freeTextLabel: (query: string) => string;
  disabled?: boolean;
  /**
   * Tooltip displayed when the picker is locked (variant `compact`): the model
   * is fixed for the session, e.g. “to change it, launch a new agent”.
   */
  disabledTooltip?: string;
  /**
   * `field` (default): full width trigger like form field.
   * `compact`: small pill (logo + name) for the bar of a chat composer.
   */
  variant?: "field" | "compact";
  /**
   * Catalog queried. `user` (default) = the active provider of the account;
   * `platform` = the OpenRouter platform key, for the admin config.
   */
  scope?: AgentModelsScope;
}) {
  const { provider, models, maxMultiplier, planId, recommended, loading } =
    useAgentModelsQuery(scope);
  const locale = useLocale();
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // “See all models”: explicit unfolding, flattened when closed
  // like search — reopen the picker should always reopen on advice.
  const [showAll, setShowAll] = useState(false);

  /**
   * The advice as it can be DISPLAYED: the order of the admin, resolved on
   * the catalog. The currently chosen model is attached if it does not
   * part — without it, the picker would open on a list where nothing is checked,
   * while a model is indeed selected.
   */
  const shortlist = useMemo(() => {
    if (recommended.length === 0) return [];
    const byId = new Map(models.map((m) => [m.id, m]));
    const list = recommended.map((id) => byId.get(id)).filter((m): m is AgentModel => !!m);
    const current = value ? byId.get(value) : undefined;
    return current && !recommended.includes(value) ? [...list, current] : list;
  }, [models, recommended, value]);

  // Short list as long as there is advice, we don't seek and we don't have
  // not unfolded.
  const collapsed = shortlist.length > 0 && !query.trim() && !showAll;

  const results = useMemo(() => {
    const q = query.trim();
    if (collapsed) return shortlist;
    if (!q) return models.slice(0, MAX_RESULTS);
    return models
      .map((m) => ({ m, score: commandFilter(`${formatModelName(m.id)} ${m.id}`, q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((r) => r.m);
  }, [collapsed, models, query, shortlist]);

  // Logo : OpenRouter → par id (`vendor/model`) ; sinon logo du provider actif.
  const logoFor = (modelId: string) =>
    provider === "openrouter" ? (
      <ModelLogo model={modelId} />
    ) : (
      <ProviderLogo provider={provider} />
    );

  const trimmed = query.trim();
  const showFreeText = trimmed.length > 0 && !models.some((m) => m.id === trimmed);

  // The ceiling is only displayed if the catalog returns one AND at least one
  // model is located above: on a list without price (illegible index), a
  // note “beyond ×4…” would not explain anything that is visible.
  const allowed = (m: AgentModel) =>
    maxMultiplier == null || isMultiplierWithinPlan(m.multiplier, maxMultiplier);
  const showCapHint =
    maxMultiplier != null && results.some((m) => m.multiplier != null && !allowed(m));

  /**
   * The “×N” of a line — silent until the catalog locates this model.
   * `alwaysAllowed` for the “default” option, which escapes the ceiling: without it,
   * an expensive instance default would carry the color of the refused lines while
   * restant cliquable.
   */
  const multiplierBadge = (m: AgentModel, alwaysAllowed = false) =>
    m.multiplier != null ? (
      <span
        className={cn(
          "shrink-0 text-xs tabular-nums",
          alwaysAllowed || allowed(m) ? "text-muted-foreground/70" : "text-muted-foreground"
        )}
      >
        {formatMultiplier(m.multiplier, locale)}
      </span>
    ) : null;

  const select = (next: string) => {
    onChange(next);
    setQuery("");
    setShowAll(false);
    setOpen(false);
  };

  /** A model line — rendered as is, or in the tips group. */
  const modelRow = (m: AgentModel) => (
    <CommandItem
      key={m.id}
      value={m.id}
      // Outside the ceiling: the line remains READABLE (cmdk opacity) but is neither
      // cliquable ni navigable au clavier.
      disabled={!allowed(m)}
      onSelect={() => select(m.id)}
    >
      {logoFor(m.id)}
      <span className="flex-1 truncate">{formatModelName(m.id)}</span>
      {multiplierBadge(m)}
      <Check className={cn("size-4 shrink-0", value === m.id ? "opacity-100" : "opacity-0")} />
    </CommandItem>
  );

  // Rendering of the “default” option: wording + resolved model (logo + name) separately.
  // Its multiplier is displayed like that of the others, but it is NEVER
  // grayed out: it's a fault of Minddy, and Minddy does not refuse hers
  // (`pr_review_model` is deliberately worth an expensive model).
  const defaultEntry = defaultModelId ? models.find((m) => m.id === defaultModelId) : undefined;
  const defaultRow = (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      {defaultModelId ? logoFor(defaultModelId) : null}
      <span className="truncate text-muted-foreground">{defaultLabel}</span>
      {defaultModelId ? (
        <span className="truncate text-xs text-muted-foreground/70">
          {formatModelName(defaultModelId)}
        </span>
      ) : null}
      {defaultEntry ? <span className="ml-auto">{multiplierBadge(defaultEntry, true)}</span> : null}
    </span>
  );

  // Locked (agent launched): static chip + tooltip, WITHOUT popover. The <span>
  // outside carries the hover (a `disabled` button does not emit a pointer event,
  // so the tooltip would not open if you put it on the button).
  if (variant === "compact" && disabled && disabledTooltip) {
    const shown = value || defaultModelId || "";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">
            <span className="pointer-events-none flex h-8 shrink items-center gap-1.5 rounded-full border border-transparent bg-transparent px-1.5 text-xs font-medium text-foreground/45">
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
        if (!next) {
          setQuery("");
          setShowAll(false);
        }
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
            className="h-8 shrink gap-1.5 rounded-full border border-transparent bg-transparent px-1.5 text-xs font-medium text-foreground/80 hover:bg-muted/50"
          >
            {value
              ? logoFor(value)
              : defaultModelId
                ? logoFor(defaultModelId)
                : null}
            <span className="max-w-[9rem] truncate">
              {/* Always the real name of the model: even when we follow “the default”,
 we display the resolved model (fallback on the label if unknown). */}
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
      {/* The list is sized on ITS content, not on the trigger: the
 model names are long, and the picker now lives in a row
 of settings where the button is the width it wants. `PopoverContent`
 is already `w-max min-w-(--radix-popover-trigger-width)` — we therefore only impose a ceiling on it, so that an extended id does not leave
 the screen. Pinning the width to the trigger (which
 `w-[var(--radix-popover-trigger-width)]` did) overwrote everything. */}
      {/* `rounded-xl` (20px) and not the default `rounded-lg` of the popover:
 it is `Command` which paints this surface and it is already 20px.
 With the removal of 8px from the list, the options (12px) are then
 concentric — 20 − 8 = 12. */}
      <PopoverContent
        className={cn(
          "rounded-xl p-0",
          variant === "compact" ? "w-80" : "max-w-[min(30rem,calc(100vw-2rem))]"
        )}
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} />
          {/* `p-1` and not `px-1`: on top of the `p-1` of `Command`, it does the
 SAME removal of 8px from all four sides — that of the search field.
 A horizontal padding alone left the last option 4px from the bottom
 and 8px from the sides, and no ray can be right below there. */}
          <CommandList className="p-1">
            <CommandItem value="__default__" onSelect={() => select("")}>
              {defaultRow}
              <Check className={cn("size-4 shrink-0", value ? "opacity-0" : "opacity-100")} />
            </CommandItem>
            {/* Grouped under its title when it is the recommended selection: the
 list is short, and the title is what says WHY. `p-0`: the
 padding of the group would shift its options from that of the default,
 just above (the list already has its `px-1`). */}
            {collapsed ? (
              <CommandGroup className="p-0" heading={t("modelRecommended")}>
                {results.map(modelRow)}
              </CommandGroup>
            ) : (
              results.map(modelRow)
            )}
            {/* The entire catalog, without having to guess what to type. An option
 of the list rather than a button at the bottom: it is navigated using
 keyboard, in continuity with the models above. */}
            {collapsed ? (
              <CommandItem value="__all__" onSelect={() => setShowAll(true)}>
                <ListPlus className="size-4 shrink-0 text-muted-foreground" />
                {/* No account announced: unfolding truncates to MAX_RESULTS,
 and promising "all 321 models" to show 50 would be
 false. What reaches them all is research. */}
                <span className="flex-1 truncate text-muted-foreground">{t("modelShowAll")}</span>
              </CommandItem>
            ) : null}
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
          {/* Which explains the graying. At the bottom of the list and outside the scroll: a
 tooltip per line was impossible (a disabled option does not emit
 any pointer event), and the reason must remain readable while browsing the catalog. */}
          {showCapHint && maxMultiplier != null ? (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              {t("modelPlanCap", { plan: planLabel(planId), limit: maxMultiplier })}
            </p>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
