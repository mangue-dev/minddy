"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/responsive-popover";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowRight01Icon, Undo02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Slider,
} from "mangue-ui";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { ModelLogo, ProviderLogo } from "@/components/model-logo";
import {
  DEFAULT_REASONING_LEVEL,
  nearestReasoningLevel,
  reasoningLevelsFor,
  type ReasoningLevel,
} from "@/lib/agent-reasoning";
import { useAssistantChatContext } from "@/lib/assistant-chat-context";
import {
  useAgentModelsQuery,
  useReasoningLevelsFor,
} from "@/lib/use-agent-models-query";
import { formatModelName } from "@/lib/model-display";
import {
  conversationReasoningIndex,
  conversationReasoningLevels,
} from "@/lib/conversation-settings";
import type { MessageKey } from "@/lib/i18n-keys";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const REASONING_LABEL_KEYS: Record<ReasoningLevel, MessageKey<"Agent">> = {
  off: "reasoningOff",
  minimal: "reasoningMinimal",
  low: "reasoningLow",
  medium: "reasoningMedium",
  high: "reasoningHigh",
  xhigh: "reasoningXhigh",
  max: "reasoningMax",
};

/** Shared Numo settings mounted by both the full composer and the FAB panel. */
export function ConversationSettings() {
  const t = useTranslations("Agent");
  const { state, updateConversationConfig } = useAssistantChatContext();
  const catalog = useAgentModelsQuery("assistant");
  const [open, setOpen] = useState(false);
  const defaultModel = catalog.defaultModel;
  const model = state.conversationModel;
  const resolvedModel = model || defaultModel;
  const modelReasoningLevels = useReasoningLevelsFor(
    resolvedModel,
    "assistant",
  );
  const reasoningLevels = conversationReasoningLevels(modelReasoningLevels);
  const defaultReasoning = catalog.defaultReasoning ?? DEFAULT_REASONING_LEVEL;
  const reasoning = state.conversationReasoningLevel ?? nearestReasoningLevel(
    defaultReasoning,
    reasoningLevels,
  );
  const reasoningIndex = conversationReasoningIndex(
    reasoning,
    modelReasoningLevels,
  );
  const displayedReasoning = reasoningLevels[reasoningIndex] ?? "off";
  const persistedReasoningNeedsRepair =
    state.conversationReasoningLevel !== null &&
    !reasoningLevels.includes(state.conversationReasoningLevel);

  useEffect(() => {
    if (!persistedReasoningNeedsRepair) return;
    void updateConversationConfig({ reasoningLevel: displayedReasoning });
  }, [
    displayedReasoning,
    persistedReasoningNeedsRepair,
    updateConversationConfig,
  ]);

  const logoFor = (modelId: string) =>
    catalog.provider === "openrouter" ? (
      <ModelLogo model={modelId} />
    ) : (
      <ProviderLogo provider={catalog.provider} />
    );

  const handleModelChange = (value: string) => {
    const nextModel = value || null;
    const nextEntry = nextModel
      ? catalog.models.find((entry) => entry.id === nextModel)
      : defaultModel
        ? catalog.models.find((entry) => entry.id === defaultModel)
        : undefined;
    const nextLevels = conversationReasoningLevels(
      reasoningLevelsFor(nextEntry?.reasoning),
    );
    const nextReasoning = state.conversationReasoningLevel === null
      ? null
      : nearestReasoningLevel(state.conversationReasoningLevel, nextLevels);
    void updateConversationConfig({
      model: nextModel,
      reasoningLevel: nextReasoning,
    });
  };

  const reset = () => {
    void updateConversationConfig({ model: null, reasoningLevel: null });
  };
  const selectReasoningIndex = (index: number) => {
    const level = reasoningLevels[index];
    if (level) void updateConversationConfig({ reasoningLevel: level });
  };

  return (
    <div className="flex min-w-0 items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            aria-label={t("sectionTitle")}
            aria-expanded={open}
            className="h-8 min-w-0 gap-1.5 rounded-full border border-transparent bg-transparent px-1.5 text-xs font-medium hover:bg-muted/50"
          >
            {resolvedModel ? logoFor(resolvedModel) : null}
            <span className="max-w-[9rem] truncate text-foreground/80">
              {resolvedModel
                ? formatModelName(resolvedModel)
                : t("modelSearchLoading")}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {t(REASONING_LABEL_KEYS[displayedReasoning])}
            </span>
            <HugeiconsIcon icon={ArrowDown01Icon} className="size-3 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          mobileTitle={t("sectionTitle")}
          align="start"
          side="top"
          sideOffset={8}
          className="w-[min(22rem,calc(100vw-2rem))] rounded-xl p-3 app-desktop:relative"
        >
          <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-2">
            <div aria-hidden />
            <div className="flex min-w-0 justify-center">
              <ModelCombobox
                value={model ?? ""}
                onChange={handleModelChange}
                defaultLabel={t("modelDefault")}
                defaultModelId={defaultModel}
                placeholder={t("modelSearchPlaceholder")}
                emptyLabel={t("modelSearchEmpty")}
                loadingLabel={t("modelSearchLoading")}
                freeTextLabel={(query) => t("modelUseCustom", { model: query })}
                variant="compact"
                triggerClassName="h-auto min-w-0 flex-col gap-0 rounded-md px-3 py-0.5 hover:bg-transparent"
                triggerContent={(
                  <span className="flex min-w-0 flex-col items-center leading-tight">
                    <span className="flex items-center gap-0.5 text-sm font-medium text-blue-500">
                      {t(REASONING_LABEL_KEYS[displayedReasoning])}
                      <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" aria-hidden />
                    </span>
                    <span className="max-w-[13rem] truncate text-sm font-normal text-muted-foreground">
                      {resolvedModel
                        ? formatModelName(resolvedModel)
                        : t("modelSearchLoading")}
                    </span>
                  </span>
                )}
                scope="assistant"
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 app-desktop:absolute app-desktop:top-1.5 app-desktop:right-1.5"
                  aria-label={t("modelSettingsReset")}
                  onClick={reset}
                >
                  <HugeiconsIcon icon={Undo02Icon} className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("modelSettingsReset")}</TooltipContent>
            </Tooltip>
          </div>

          <div className="mt-4 px-1 pb-1">
            <Slider
              value={[reasoningIndex]}
              min={0}
              max={Math.max(0, reasoningLevels.length - 1)}
              step={1}
              aria-label={t("reasoning")}
              className="[&_[data-slot=slider-range]]:bg-blue-500"
              onValueChange={(values) => {
                selectReasoningIndex(values[0] ?? 0);
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
      {state.conversationConfigError ? (
        <span role="alert" className="max-w-56 truncate text-xs text-destructive">
          {state.conversationConfigError}
        </span>
      ) : null}
    </div>
  );
}
