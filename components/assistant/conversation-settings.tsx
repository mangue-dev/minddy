"use client";

import { ResponsivePopover, ResponsivePopoverContent, ResponsivePopoverTrigger } from "@/components/ui/responsive-popover";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowRight01Icon, Undo02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
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
import type { AiProviderChoice } from "@/lib/ai-surfaces";
import { catalogModelReasoning } from "@/lib/model-reasoning-rules";
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
  // Numo's default provider and the providers the account can choose; then
  // the catalog of the provider this conversation uses (MIN-826).
  const defaults = useAgentModelsQuery("assistant");
  const providerChoice = (state.conversationProvider as AiProviderChoice | null) ?? null;
  const chosenCatalog = useAgentModelsQuery("assistant", "text", providerChoice);
  const catalog = providerChoice ? chosenCatalog : defaults;
  const currentProvider = providerChoice ?? defaults.defaultProvider;
  const [open, setOpen] = useState(false);
  const defaultModel = catalog.defaultModel;
  const model = state.conversationModel;
  const resolvedModel = model || defaultModel;
  const modelReasoningLevels = useReasoningLevelsFor(
    resolvedModel,
    "assistant",
    providerChoice,
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
  // Judged against the model's real levels only: while the catalog loads, or
  // for a model it does not list, the levels are the generic fallback, and a
  // "repair" would overwrite the stored choice and move the conversation to
  // the top of the history just because it was opened.
  const persistedReasoningNeedsRepair =
    !catalog.loading &&
    catalog.models.some((entry) => entry.id === resolvedModel) &&
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
      reasoningLevelsFor(catalogModelReasoning(
        catalog.provider,
        nextModel ?? defaultModel,
        nextEntry,
      )),
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
    void updateConversationConfig({ provider: null, model: null, reasoningLevel: null });
  };
  // The model list starts with the provider (MIN-826). Another provider's
  // model is saved with it; the reasoning choice stays and is placed on that
  // model's levels once its catalog loads.
  const selectProviderModel = (next: AiProviderChoice, nextModel: string) => {
    if (next === currentProvider) {
      handleModelChange(nextModel);
      return;
    }
    void updateConversationConfig({
      provider: next === defaults.defaultProvider ? null : next,
      model: nextModel || null,
    });
  };
  const selectReasoningIndex = (index: number) => {
    const level = reasoningLevels[index];
    if (level) void updateConversationConfig({ reasoningLevel: level });
  };

  return (
    <div className="flex min-w-0 items-center">
      <ResponsivePopover open={open} onOpenChange={setOpen}>
        <ResponsivePopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            aria-label={t("sectionTitle")}
            aria-expanded={open}
            // The composer shows the provider's logo and a chevron only
            // (MIN-827): the model and its reasoning level are named on hover.
            tooltip={
              resolvedModel
                ? `${formatModelName(resolvedModel)} · ${t(REASONING_LABEL_KEYS[displayedReasoning])}`
                : t("modelSearchLoading")
            }
            className="h-8 shrink-0 gap-1 rounded-full border border-transparent bg-transparent px-2 text-xs font-medium hover:bg-muted/50"
          >
            {resolvedModel ? logoFor(resolvedModel) : null}
            <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </ResponsivePopoverTrigger>
        <ResponsivePopoverContent
          mobileTitle={t("sectionTitle")}
          align="end"
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
                triggerClassName="group/model-trigger h-auto min-w-0 flex-col gap-0 rounded-md px-3 py-0.5 hover:bg-transparent"
                triggerContent={(
                  <span className="flex min-w-0 flex-col items-center leading-tight">
                    <span className="text-sm font-medium text-primary">
                      {t(REASONING_LABEL_KEYS[displayedReasoning])}
                    </span>
                    <span className="flex min-w-0 max-w-[13rem] items-center gap-0.5 text-sm font-normal text-muted-foreground transition-colors group-hover/model-trigger:text-foreground">
                      <span className="min-w-0 truncate">
                        {resolvedModel
                          ? formatModelName(resolvedModel)
                          : t("modelSearchLoading")}
                      </span>
                      <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5 shrink-0" aria-hidden />
                    </span>
                  </span>
                )}
                scope="assistant"
                providerChoice={providerChoice}
                providerStep={{
                  providers: defaults.providers,
                  current: currentProvider,
                  onSelect: selectProviderModel,
                }}
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
              disabled={reasoningLevels.length < 2}
              aria-label={t("reasoning")}
              onValueChange={(values) => {
                selectReasoningIndex(values[0] ?? 0);
              }}
            />
          </div>
        </ResponsivePopoverContent>
      </ResponsivePopover>
      {state.conversationConfigError ? (
        <span role="alert" className="max-w-56 truncate text-xs text-destructive">
          {state.conversationConfigError}
        </span>
      ) : null}
    </div>
  );
}
