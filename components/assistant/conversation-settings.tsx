"use client";

import { ModelCombobox } from "@/components/agent/model-combobox";
import { ReasoningCombobox } from "@/components/agent/reasoning-combobox";
import {
  DEFAULT_REASONING_LEVEL,
  nearestReasoningLevel,
  reasoningLevelsFor,
} from "@/lib/agent-reasoning";
import { useAssistantChatContext } from "@/lib/assistant-chat-context";
import { useAgentModelsQuery, useReasoningLevelsFor } from "@/lib/use-agent-models-query";
import { useTranslations } from "next-intl";

/** Shared Numo settings mounted by both the full composer and the FAB panel. */
export function ConversationSettings() {
  const t = useTranslations("Agent");
  const { state, updateConversationConfig } = useAssistantChatContext();
  const catalog = useAgentModelsQuery("assistant");
  const defaultModel = catalog.defaultModel;
  const model = state.conversationModel;
  const modelForReasoning = model || defaultModel;
  const reasoningLevels = useReasoningLevelsFor(modelForReasoning, "assistant");
  const defaultReasoning = catalog.defaultReasoning ?? DEFAULT_REASONING_LEVEL;
  const reasoning = nearestReasoningLevel(
    state.conversationReasoningLevel ?? defaultReasoning,
    reasoningLevels,
  );

  const handleModelChange = (value: string) => {
    const nextModel = value || null;
    const nextEntry = nextModel
      ? catalog.models.find((entry) => entry.id === nextModel)
      : defaultModel
        ? catalog.models.find((entry) => entry.id === defaultModel)
        : undefined;
    const nextLevels = reasoningLevelsFor(nextEntry?.reasoning);
    const nextReasoning = state.conversationReasoningLevel === null
      ? null
      : nearestReasoningLevel(state.conversationReasoningLevel, nextLevels);
    void updateConversationConfig({ model: nextModel, reasoningLevel: nextReasoning });
  };

  return (
    <div className="flex min-w-0 items-center gap-0.5" aria-label={t("sectionTitle")}>
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
        scope="assistant"
      />
      <ReasoningCombobox
        value={reasoning}
        onChange={(value) => void updateConversationConfig({ reasoningLevel: value })}
        levels={reasoningLevels}
        variant="compact"
      />
      {state.conversationConfigError ? (
        <span role="alert" className="max-w-56 truncate text-xs text-destructive">
          {state.conversationConfigError}
        </span>
      ) : null}
    </div>
  );
}
