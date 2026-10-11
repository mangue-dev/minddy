"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, toast } from "mangue-ui";
import { SettingsRow } from "./settings-ui";
import { saveAgentPreferencesApi } from "@/lib/agent-keys-api";
import { agentPreferencesQueryKey } from "@/lib/use-agent-preferences-query";
import { useNativeAgentModelsQuery } from "@/lib/use-native-agent-models-query";
import { NativePrototypeRequestError } from "@/lib/native-agent-prototype-api";

const DEFAULT_CHOICE = "__native_default__";
const EFFORT_LABELS = {
  none: "effort_none", minimal: "effort_minimal", low: "effort_low",
  medium: "effort_medium", high: "effort_high", xhigh: "effort_xhigh",
  max: "effort_max", ultra: "effort_ultra",
} as const;

/** Account defaults affect new workers; an existing worker keeps its saved choices. */
export function NativeAgentModelPreferences({ engine, enabled, loading, preference }: {
  engine: "codex" | "claude_code";
  enabled: boolean;
  loading: boolean;
  preference?: { model: string | null; reasoningEffort: string | null };
}) {
  const t = useTranslations("NativeAgentModels");
  const te = useTranslations("NativeAgentConnections");
  const client = useQueryClient();
  const catalog = useNativeAgentModelsQuery(engine, enabled);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const model = preference?.model ?? null;
  const effort = preference?.reasoningEffort ?? null;
  const models = catalog.data?.models ?? [];
  const selected = model ? models.find((option) => option.id === model)
    : models.find((option) => option.isDefault);
  const efforts = selected?.supportedReasoningEfforts ?? [];
  const unavailable = Boolean(model && !models.some((option) => option.id === model));
  const disabled = !enabled || loading || saving || catalog.refresh.isPending;

  const save = async (nextModel: string | null, nextEffort: string | null) => {
    setSaving(true);
    setSaveError(false);
    try {
      await saveAgentPreferencesApi({
        native_model_preferences: { [engine]: { model: nextModel, reasoningEffort: nextEffort } },
      });
      await client.invalidateQueries({ queryKey: agentPreferencesQueryKey });
      toast.success(t("saved"));
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const failure = catalog.refresh.error ?? catalog.error;
  const effortLabel = (value: string) => value in EFFORT_LABELS
    ? t(EFFORT_LABELS[value as keyof typeof EFFORT_LABELS]) : value;

  return <>
    <SettingsRow label={t("model")} hint={t(engine === "codex" ? "codexHint" : "claudeHint")}
      control={<div className="flex flex-wrap items-center justify-end gap-2">
        <Select value={model ?? DEFAULT_CHOICE} disabled={disabled}
          onValueChange={(value) => void save(value === DEFAULT_CHOICE ? null : value, null)}>
          <SelectTrigger className="w-64 max-w-full" aria-label={t("model")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_CHOICE}>{t("automatic")}</SelectItem>
            {unavailable && model && <SelectItem value={model} disabled>{t("unavailableModel", { model })}</SelectItem>}
            {models.map((option) => <SelectItem key={option.id} value={option.id}>{option.displayName}</SelectItem>)}
          </SelectContent>
        </Select>
        {engine === "codex" && <Button size="sm" variant="ghost" disabled={disabled}
          onClick={() => catalog.refresh.mutate()}>{t(catalog.refresh.isPending ? "refreshing" : "refresh")}</Button>}
      </div>}>
      {engine === "codex" && !catalog.isPending && models.length === 0 && !failure
        && <p className="py-2 text-sm text-muted-foreground" role="status">{t("empty")}</p>}
      {unavailable && <p className="py-2 text-sm text-muted-foreground" role="status">{t("unavailableHint")}</p>}
      {failure && <p className="py-2 text-sm text-destructive" role="alert">
        {failure instanceof NativePrototypeRequestError && failure.code === "connection_busy"
          ? te("error_connection_busy") : failure instanceof NativePrototypeRequestError
              && failure.code === "reconnect_required" ? te("error_reconnect_required") : t("catalogError")}
      </p>}
      {saveError && <p className="py-2 text-sm text-destructive" role="alert">{t("saveError")}</p>}
    </SettingsRow>
    <SettingsRow label={t("thinking")} hint={t("thinkingHint")}
      control={<Select value={effort ?? DEFAULT_CHOICE} disabled={disabled}
        onValueChange={(value) => void save(model, value === DEFAULT_CHOICE ? null : value)}>
        <SelectTrigger className="w-64 max-w-full" aria-label={t("thinking")}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_CHOICE}>{t("automatic")}</SelectItem>
          {effort && !efforts.includes(effort) && <SelectItem value={effort} disabled>{effortLabel(effort)}</SelectItem>}
          {efforts.map((value) => <SelectItem key={value} value={value}>{effortLabel(value)}</SelectItem>)}
        </SelectContent>
      </Select>} />
  </>;
}
