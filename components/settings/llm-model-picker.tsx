"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Undo02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ResponsivePopover, ResponsivePopoverContent, ResponsivePopoverTrigger } from "@/components/ui/responsive-popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { ModelLogo, ProviderLogo } from "@/components/model-logo";
import {
  DEFAULT_REASONING_LEVEL,
  nearestReasoningLevel,
  reasoningLevelsFor,
  type ReasoningLevel,
} from "@/lib/agent-reasoning";
import type { AiProviderChoice } from "@/lib/ai-surfaces";
import { conversationReasoningLevels } from "@/lib/conversation-settings";
import { formatModelName } from "@/lib/model-display";
import { catalogModelReasoning } from "@/lib/model-reasoning-rules";
import { useAgentModelsQuery, useReasoningLevelsFor, type AgentModelsScope } from "@/lib/use-agent-models-query";
import type { MessageKey } from "@/lib/i18n-keys";

const REASONING_LABEL_KEYS: Record<ReasoningLevel, MessageKey<"Agent">> = {
  off: "reasoningOff",
  minimal: "reasoningMinimal",
  low: "reasoningLow",
  medium: "reasoningMedium",
  high: "reasoningHigh",
  xhigh: "reasoningXhigh",
  max: "reasoningMax",
};

export type LlmChoice = { model: string | null; reasoningLevel: ReasoningLevel | null };

/**
 * A language model and its reasoning level: the popover the Numo composer
 * used to open (the model, a reset, then the reasoning slider), behind a
 * trigger shaped like the other selects of the row. `null` follows the
 * default model and the default reasoning level. A model change keeps the
 * chosen level, placed on the new model's nearest one.
 *
 * The account's settings list one provider's models for a personal key
 * (scope `assistant`); the instance administration lists the platform's
 * (scope `platform`), with its own labels and built-in level.
 */
export function LlmModelPicker({
  scope = "assistant",
  provider,
  value,
  applicationModel,
  onChange,
  disabled,
  ariaLabel,
  labels,
  defaultReasoning,
}: {
  scope?: Extract<AgentModelsScope, "assistant" | "platform">;
  /** The provider whose models are listed; the account's scope only. */
  provider?: AiProviderChoice;
  value: LlmChoice;
  applicationModel: string | null;
  onChange: (next: LlmChoice) => void;
  disabled?: boolean;
  ariaLabel: string;
  /** Overrides the account's wording of the default, the reset and the model list. */
  labels?: { default?: string; reset?: string; model?: string };
  /** The level a `null` reasoning follows; the catalog's when omitted. */
  defaultReasoning?: ReasoningLevel;
}) {
  const t = useTranslations("Agent");
  const tAccount = useTranslations("Account");
  const defaultLabel = labels?.default ?? tAccount("numoApplicationDefault");
  const resetLabel = labels?.reset ?? tAccount("numoModelReset");
  const modelLabel = labels?.model ?? tAccount("numoDefaultModel");
  const [open, setOpen] = useState(false);
  const catalog = useAgentModelsQuery(scope, "text", provider);
  const resolvedModel = value.model || applicationModel;
  const reasoningLevels = conversationReasoningLevels(
    useReasoningLevelsFor(resolvedModel, scope, provider),
  );
  const displayedReasoning = nearestReasoningLevel(
    value.reasoningLevel ?? defaultReasoning ?? catalog.defaultReasoning ?? DEFAULT_REASONING_LEVEL,
    reasoningLevels,
  );
  // A drag moves the slider here; the level saves once it is released.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const reasoningIndex = dragIndex ?? Math.max(0, reasoningLevels.indexOf(displayedReasoning));
  const reasoningLabel = t(REASONING_LABEL_KEYS[reasoningLevels[reasoningIndex] ?? displayedReasoning]);

  const logoFor = (modelId: string) =>
    catalog.provider === "openrouter" ? <ModelLogo model={modelId} /> : <ProviderLogo provider={catalog.provider} />;

  const changeModel = (next: string) => {
    const model = next || null;
    const target = model ?? applicationModel;
    const entry = target ? catalog.models.find((candidate) => candidate.id === target) : undefined;
    const levels = conversationReasoningLevels(
      reasoningLevelsFor(catalogModelReasoning(catalog.provider, target, entry)),
    );
    onChange({
      model,
      reasoningLevel: value.reasoningLevel === null ? null : nearestReasoningLevel(value.reasoningLevel, levels),
    });
  };
  const changeReasoning = (index: number) => {
    const level = reasoningLevels[index];
    if (level && level !== value.reasoningLevel) onChange({ model: value.model, reasoningLevel: level });
  };
  const reset = () => onChange({ model: null, reasoningLevel: null });

  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            {resolvedModel ? logoFor(resolvedModel) : null}
            <span className="truncate">
              {resolvedModel ? formatModelName(resolvedModel) : defaultLabel}
            </span>
            <span className="shrink-0 text-muted-foreground">· {reasoningLabel}</span>
          </span>
          <ChevronDownIcon className="pointer-events-none ml-2 size-4 shrink-0 text-muted-foreground" />
        </Button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        mobileTitle={ariaLabel}
        align="end"
        sideOffset={8}
        className="w-[min(22rem,calc(100vw-2rem))] rounded-xl p-3 app-desktop:relative"
      >
        <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-2">
          <div aria-hidden />
          <div className="flex min-w-0 justify-center">
            <ModelCombobox
              value={value.model ?? ""}
              onChange={changeModel}
              defaultLabel={defaultLabel}
              defaultModelId={applicationModel}
              placeholder={t("modelSearchPlaceholder")}
              emptyLabel={t("modelSearchEmpty")}
              loadingLabel={t("modelSearchLoading")}
              freeTextLabel={(query) => t("modelUseCustom", { model: query })}
              variant="compact"
              ariaLabel={modelLabel}
              triggerClassName="group/model-trigger h-auto min-w-0 flex-col gap-0 rounded-md px-3 py-0.5 hover:bg-transparent"
              triggerContent={(
                <span className="flex min-w-0 flex-col items-center leading-tight">
                  <span className="text-sm font-medium text-primary">{reasoningLabel}</span>
                  <span className="flex min-w-0 max-w-[13rem] items-center gap-0.5 text-sm font-normal text-muted-foreground transition-colors group-hover/model-trigger:text-foreground">
                    <span className="min-w-0 truncate">
                      {resolvedModel ? formatModelName(resolvedModel) : t("modelSearchLoading")}
                    </span>
                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5 shrink-0" aria-hidden />
                  </span>
                </span>
              )}
              scope={scope}
              capability="text"
              providerChoice={provider}
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 app-desktop:absolute app-desktop:top-1.5 app-desktop:right-1.5"
                aria-label={resetLabel}
                disabled={value.model === null && value.reasoningLevel === null}
                onClick={reset}
              >
                <HugeiconsIcon icon={Undo02Icon} className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{resetLabel}</TooltipContent>
          </Tooltip>
        </div>
        <div className="mt-4 px-1 pb-1">
          <Slider
            value={[reasoningIndex]}
            min={0}
            max={Math.max(0, reasoningLevels.length - 1)}
            step={1}
            disabled={reasoningLevels.length < 2}
            aria-label={t("reasoning")}
            onValueChange={(values) => setDragIndex(values[0] ?? 0)}
            onValueCommit={(values) => {
              setDragIndex(null);
              changeReasoning(values[0] ?? 0);
            }}
          />
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
}
