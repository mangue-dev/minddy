"use client";

import { AdminHeaderActions } from "@/components/admin/admin-header-slot";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, FileExportIcon, FileImportIcon } from "@hugeicons/core-free-icons";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useTranslations} from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MessageKey } from "@/lib/i18n-keys";
import {SettingsGroup, SettingsRow} from "@/components/settings/settings-ui";
import {HelpHint} from "@/components/settings/help-hint";
import {ModelCombobox} from "@/components/agent/model-combobox";
import {ByokModelCombobox} from "@/components/admin/byok-model-combobox";

import {formatModelName} from "@/lib/model-display";
import {getAgentProvider} from "@/lib/agent-providers";
import {byokProviderFromConfigKey, modelKeyFromByokConfigKey} from "@/lib/byok-model-catalog";
import {isModelCatalogCapability} from "@/lib/model-catalog-capability";
import type {ByokCatalogProvider} from "@/lib/byok-model-catalog";
import {
  AI_MODEL_CONFIG_FIELDS,
  AI_MODEL_CONFIG_GROUPS,
  getAiConfigField,
} from "@/lib/ai-model-config";
import type {AiConfigField, AiConfigGroup} from "@/lib/ai-model-config";
import {
  buildModelConfigFile,
  type ModelConfigChange,
  type ModelConfigFileError,
} from "@/lib/ai-model-config-file";
import {REASONING_LEVELS, toReasoningLevel, type ReasoningLevel} from "@/lib/agent-reasoning";
import {DECISION_ENGINE_CONFIG_KEY, toDecisionEngine} from "@/lib/decision-engine";
import {ADMIN_SECTIONS, adminSectionAnchor} from "@/lib/admin-sections";
import type {AdminSectionId} from "@/lib/admin-sections";

type ConfigValues = Record<string, string | null>;

/** Key for the `Admin` namespace. Used for keys assembled at runtime, which must
 * be explicitly cast there (convention: cf. lib/i18n-keys.ts). */
type AdminKey = MessageKey<"Admin">;

/** A refused save; `code` names a refusal the dashboard can localize. */
class ConfigSaveError extends Error {
  constructor(message: string, readonly code: string | null) {
    super(message);
  }
}

/** Saves one value. */
async function patchConfig(key: string, value: string): Promise<void> {
  const res = await fetch("/api/admin/app-config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  const body = (await res.json().catch(() => null)) as
    | { error?: string; code?: string }
    | null;
  if (!res.ok) {
    throw new ConfigSaveError(body?.error ?? `HTTP ${res.status}`, body?.code ?? null);
  }
}

/** Decision-model refusals (MIN-694) — typed table, no key assembled at runtime. */
const DECISION_MODEL_ERROR_KEYS: Record<string, AdminKey> = {
  catalog_unavailable: "decisionModelErrors.catalog_unavailable",
  not_a_decision_model: "decisionModelErrors.not_a_decision_model",
  compatibility_check_failed: "decisionModelErrors.compatibility_check_failed",
  // Embedding and transcription fields are checked against their catalog family (MIN-717).
  capability_mismatch: "decisionModelErrors.capability_mismatch",
};

/** Import refusals — typed table, no key assembled at runtime. */
const FILE_ERROR_KEYS: Record<ModelConfigFileError | "refused", AdminKey> = {
  invalid_json: "modelsFile.errors.invalid_json",
  not_a_model_config: "modelsFile.errors.not_a_model_config",
  newer_version: "modelsFile.errors.newer_version",
  invalid_value: "modelsFile.errors.invalid_value",
  refused: "modelsFile.errors.refused",
};

/** Records `onSaved` callers report: the saved key and its value. */
type OnSaved = (key: string, value: string) => void;

/** A field's label, whatever kind of key it is. */
function useFieldLabel() {
  const t = useTranslations("Admin");
  return useCallback(
    (field: AiConfigField): string => {
      if (field.adminLabel) return field.adminLabel;
      const key = `fields.${field.key}.label` as AdminKey;
      return t.has(key) ? t(key) : field.key;
    },
    [t],
  );
}

/**
 * Admin-only screen to choose the AI models minddy runs (MIN-954): one card
 * per model role — the LLM that Numo and every text task run, embeddings,
 * speech to text, and the decision model. No task has a model of its own.
 * BYOK defaults are folded at the bottom:
 * they only matter to members who use their own provider key. Access is
 * enforced server-side by `app/(app)/admin/layout.tsx` and the API — this is
 * UI only.
 */
const APP_CONFIG_QUERY_KEY = ["admin", "app-config"] as const;

export function AdminModelsDashboard() {
  const t = useTranslations("Admin");
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    queryKey: APP_CONFIG_QUERY_KEY,
    queryFn: async (): Promise<ConfigValues> => {
      const res = await fetch("/api/admin/app-config", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { values: ConfigValues };
      return data.values ?? {};
    },
    staleTime: 60 * 1000,
  });
  const values = configQuery.data ?? null;
  const error = configQuery.data ? null : ((configQuery.error as Error | null)?.message ?? null);

  const fieldsByGroup = useMemo(() => {
    const map = Object.fromEntries(AI_MODEL_CONFIG_GROUPS.map((group) => [group, [] as AiConfigField[]])) as Record<
      AiConfigGroup,
      AiConfigField[]
    >;
    for (const f of AI_MODEL_CONFIG_FIELDS) map[f.group].push(f);
    return map;
  }, []);

  // One section per BYOK provider (MIN-416), so each vendor's namespace
  // reads as a unit. Fields of a provider without catalog support (generic)
  // stay in the leftover bucket and render as free-text rows.
  const byokByProvider = useMemo(() => {
    const map: Partial<Record<ByokCatalogProvider, AiConfigField[]>> = {};
    const other: AiConfigField[] = [];
    for (const f of fieldsByGroup.byok) {
      const provider = byokProviderFromConfigKey(f.key);
      if (provider) (map[provider] ??= []).push(f);
      else other.push(f);
    }
    return { map, other };
  }, [fieldsByGroup]);

  // Reflect a saved value back into local state so the row's dirty check
  // resets.
  const onSaved = useCallback<OnSaved>((key, value) => {
    queryClient.setQueryData<ConfigValues>(APP_CONFIG_QUERY_KEY, (prev) => ({
      ...prev,
      [key]: value,
    }));
  }, [queryClient]);

  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: APP_CONFIG_QUERY_KEY });
  }, [queryClient]);

  return (
    /* Width and margins inherited from the shell (`admin-dashboard`). */
    <div className="space-y-8">
      <header className="min-w-0">
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      {/* Import and export drive the whole tab: they sit in the pane's header. */}
      <AdminHeaderActions>
        <ModelsFileActions values={values} onImported={reload} />
      </AdminHeaderActions>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {t("loadError")}
        </div>
      ) : (
        /* It's literally a settings screen: one card per role, one row per
           setting. Same grammar as /settings (MIN-167). */
        <div className="flex flex-col gap-6">
          {AI_MODEL_CONFIG_GROUPS.filter((group) => group !== "byok").map((group) => (
            <ModelGroupCard
              key={group}
              group={group}
              fields={fieldsByGroup[group]}
              values={values}
              onSaved={onSaved}
            />
          ))}

          <ByokSection byokByProvider={byokByProvider} values={values} onSaved={onSaved} />
        </div>
      )}
    </div>
  );
}

/** The search destination of each card (lib/admin-sections.ts). */
const MODEL_GROUP_ANCHORS: Record<AiConfigGroup, AdminSectionId> = {
  assistant: ADMIN_SECTIONS.modelsAssistant,
  embeddings: ADMIN_SECTIONS.modelsEmbeddings,
  voice: ADMIN_SECTIONS.modelsVoice,
  decision: ADMIN_SECTIONS.modelsDecision,
  byok: ADMIN_SECTIONS.modelsByok,
};

function RowSkeleton() {
  return (
    <div className="flex flex-col gap-2 py-3.5">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-9 w-full max-w-md" />
    </div>
  );
}

/** One card per role: its model, and the settings that go with it. */
function ModelGroupCard({
  group,
  fields,
  values,
  onSaved,
}: {
  group: AiConfigGroup;
  fields: AiConfigField[];
  values: ConfigValues | null;
  onSaved: OnSaved;
}) {
  const t = useTranslations("Admin");
  const descKey = `groups.${group}.desc` as AdminKey;

  return (
    <SettingsGroup
      id={adminSectionAnchor(MODEL_GROUP_ANCHORS[group])}
      title={t(`groups.${group}.title`)}
      help={t.has(descKey) ? t(descKey) : undefined}
    >
      {visibleFields(fields, values).map((field) =>
        values === null ? (
          <RowSkeleton key={field.key} />
        ) : (
          <ConfigRow
            key={field.key}
            field={field}
            value={values[field.key] ?? null}
            onSaved={onSaved}
          />
        ),
      )}
    </SettingsGroup>
  );
}

/**
 * The decision model only answers in decision-model mode (MIN-980): with the
 * language model as the engine, its picker would set a model nothing runs.
 */
function visibleFields(fields: AiConfigField[], values: ConfigValues | null): AiConfigField[] {
  if (toDecisionEngine(values?.[DECISION_ENGINE_CONFIG_KEY]) !== "llm") return fields;
  return fields.filter((field) => field.catalogCapability !== "decision");
}

/** Personal-key provider defaults, folded: they only concern BYOK members. */
function ByokSection({
  byokByProvider,
  values,
  onSaved,
}: {
  byokByProvider: {
    map: Partial<Record<ByokCatalogProvider, AiConfigField[]>>;
    other: AiConfigField[];
  };
  values: ConfigValues | null;
  onSaved: OnSaved;
}) {
  const t = useTranslations("Admin");
  const [open, setOpen] = useState(false);
  return (
    <section
      id={adminSectionAnchor(ADMIN_SECTIONS.modelsByok)}
      className="scroll-mt-20 rounded-xl"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-1.5 px-0.5">
          <CollapsibleTrigger className="flex min-w-0 items-center gap-1.5 rounded-md text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t("groups.byok.title")}
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
            />
          </CollapsibleTrigger>
          <HelpHint>{t("groups.byok.desc")}</HelpHint>
        </div>
        <CollapsibleContent>
          <div className="mt-3 flex flex-col gap-4">
            {(Object.keys(byokByProvider.map) as ByokCatalogProvider[]).map((provider) => (
              <ByokProviderSection
                key={provider}
                provider={provider}
                fields={byokByProvider.map[provider] ?? []}
                values={values}
                loading={values === null}
                onSaved={onSaved}
              />
            ))}
            {byokByProvider.other.length > 0 ? (
              <SettingsGroup title={t("groups.byokOther")}>
                {byokByProvider.other.map((field) =>
                  values === null ? (
                    <RowSkeleton key={field.key} />
                  ) : (
                    <ConfigRow
                      key={field.key}
                      field={field}
                      value={values[field.key] ?? null}
                      onSaved={onSaved}
                    />
                  ),
                )}
              </SettingsGroup>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

/** A changed key, in words: its card, its setting, and whether it is a shortcut. */
function useChangeLabel() {
  const t = useTranslations("Admin");
  const label = useFieldLabel();
  return useCallback(
    (key: string): string => {
      const field = getAiConfigField(key);
      if (!field) return key;
      const name = label(field);
      return name;
    },
    [label, t],
  );
}

/**
 * Export and import of the configuration (MIN-829). Export writes the stored
 * values as a versioned file; import sends the file for a dry run first, shows
 * every change, and applies only on confirmation — all or nothing.
 */
function ModelsFileActions({
  values,
  onImported,
}: {
  values: ConfigValues | null;
  onImported: () => Promise<void>;
}) {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const changeLabel = useChangeLabel();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    file: unknown;
    name: string;
    changes: ModelConfigChange[];
    ignored: string[];
    upgraded: boolean;
  } | null>(null);

  const exportFile = () => {
    if (!values) return;
    const file = buildModelConfigFile(values);
    const blob = new Blob([`${JSON.stringify(file, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `minddy-models-${file.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const send = async (file: unknown, apply: boolean) => {
    const res = await fetch("/api/admin/app-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file, apply }),
    });
    const body = (await res.json().catch(() => null)) as
      | { error?: string; detail?: string; key?: string; changes?: ModelConfigChange[]; ignored?: string[]; upgraded?: boolean }
      | null;
    if (!res.ok) {
      const key = FILE_ERROR_KEYS[body?.error as keyof typeof FILE_ERROR_KEYS];
      throw new Error(
        key
          ? t(key, { setting: body?.key ? changeLabel(body.key) : "", detail: body?.detail ?? "" })
          : body?.error ?? `HTTP ${res.status}`,
      );
    }
    return body ?? {};
  };

  const pick = async (picked: File | undefined) => {
    if (!picked) return;
    setBusy(true);
    try {
      let file: unknown;
      try {
        file = JSON.parse(await picked.text());
      } catch {
        throw new Error(t("modelsFile.errors.invalid_json"));
      }
      const preview = await send(file, false);
      setPending({
        file,
        name: picked.name,
        changes: preview.changes ?? [],
        ignored: preview.ignored ?? [],
        upgraded: preview.upgraded === true,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const apply = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await send(pending.file, true);
      setPending(null);
      await onImported();
      toast.success(t("modelsFile.applied"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const shown = (value: string | null) => value ? formatModelName(value) || value : t("modelsFile.defaultValue");

  return (
    <div id={adminSectionAnchor(ADMIN_SECTIONS.modelsFile)} className="flex shrink-0 items-center gap-1 rounded-lg">
      <Button variant="ghost" size="sm" onClick={exportFile} disabled={!values}>
        <HugeiconsIcon icon={FileExportIcon} className="size-4" />
        {t("modelsFile.export")}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => input.current?.click()} disabled={busy || !values}>
        {busy && !pending ? <Spinner /> : <HugeiconsIcon icon={FileImportIcon} className="size-4" />}
        {t("modelsFile.import")}
      </Button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label={t("modelsFile.import")}
        onChange={(event) => void pick(event.target.files?.[0])}
      />

      <Dialog open={pending !== null} onOpenChange={(open) => !open && !busy && setPending(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("modelsFile.previewTitle")}</DialogTitle>
            <DialogDescription>
              {pending && pending.changes.length > 0
                ? t("modelsFile.previewDescription", { count: pending.changes.length, file: pending.name })
                : t("modelsFile.previewNone", { file: pending?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          {pending && pending.changes.length > 0 ? (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
              {pending.changes.map((change) => (
                <li key={change.key} className="flex flex-col gap-0.5 px-3 py-2">
                  <span className="font-medium">{changeLabel(change.key)}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("modelsFile.change", { from: shown(change.from), to: shown(change.to) })}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {pending?.upgraded ? (
            <p className="text-xs text-muted-foreground">{t("modelsFile.upgraded")}</p>
          ) : null}
          {pending && pending.ignored.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("modelsFile.ignored", { count: pending.ignored.length, entries: pending.ignored.join(", ") })}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>
              {tCommon("cancel")}
            </Button>
            {pending && pending.changes.length > 0 ? (
              <Button onClick={() => void apply()} disabled={busy}>
                {busy ? <Spinner /> : null}
                {t("modelsFile.apply")}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * One BYOK provider, as one card: its account-wide default on top, then one
 * row per call type. Every control is the provider-aware picker
 * (`ByokModelCombobox`) — it lists this provider's native models with no API
 * key required, and keeps free entry for what the index does not mirror.
 */
function ByokProviderSection({
  provider,
  fields,
  values,
  loading,
  onSaved,
}: {
  provider: ByokCatalogProvider;
  fields: AiConfigField[];
  values: ConfigValues | null;
  loading: boolean;
  onSaved: OnSaved;
}) {
  const t = useTranslations("Admin");
  const tAgent = useTranslations("Agent");
  const ordered = useMemo(() => [...fields], [fields]);

  return (
    <SettingsGroup
      title={getAgentProvider(provider)?.label ?? provider}
    >
      {ordered.map((field) => {
        // Feature rows speak the label of THEIR call type ("Assistant",
        // "Voice dictation"…); inside a provider-titled section that reads
        // better than the generated "Provider · key" label of the flat list.
        const modelKey = modelKeyFromByokConfigKey(field.key);
        const label = modelKey
          ? t(`fields.${modelKey}.label` as AdminKey)
          : (field.adminLabel ?? t(`fields.${field.key}.label` as AdminKey));
        return (
          <ByokModelRow
            key={field.key}
            field={field}
            provider={provider}
            isBorderDefault={false}
            label={label}
            value={values?.[field.key] ?? null}
            loading={loading}
            onSaved={onSaved}
            defaultLabel={`${t("fieldDefault")} (${formatModelName(field.fallback) || field.fallback})`}
            placeholder={tAgent("modelSearchPlaceholder")}
            useCustomLabel={(query) => tAgent("modelUseCustom", { model: query })}
            loadingLabel={tAgent("modelSearchLoading")}
          />
        );
      })}
    </SettingsGroup>
  );
}

/**
 * A BYOK default row. The control depends on whether this provider has a
 * catalog-backed picker (OpenAI / Anthropic / Google, MIN-416): a real
 * searchable select fed server-side — or, for any other provider id, the old
 * free-text input, because their namespace cannot be derived from OpenRouter.
 */
function ByokModelRow({
  field,
  provider,
  isBorderDefault,
  label,
  value,
  loading,
  onSaved,
  defaultLabel,
  placeholder,
  useCustomLabel,
  loadingLabel,
}: {
  field: AiConfigField;
  provider: ByokCatalogProvider;
  /** The account-wide border default — labeled differently from call-type rows. */
  isBorderDefault: boolean;
  label: string;
  value: string | null;
  loading: boolean;
  onSaved: OnSaved;
  defaultLabel: string;
  placeholder: string;
  useCustomLabel: (query: string) => string;
  loadingLabel: string;
}) {
  const t = useTranslations("Admin");
  const saved = (value ?? "").trim();
  const [busy, setBusy] = useState(false);

  const select = async (next: string) => {
    if (busy || next === saved) return;
    setBusy(true);
    try {
      await patchConfig(field.key, next);
      onSaved(field.key, next);
      toast.success(t("saved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-2 py-3.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-full max-w-md" />
      </div>
    );
  }

  return (
    <SettingsRow
      label={label}
      hint={
        isBorderDefault || saved ? undefined : `${t("fieldDefault")} · ${formatModelName(field.fallback) || field.fallback}`
      }
      control={
        <div className="flex min-w-0 items-center gap-2 sm:w-72">
          <ByokModelCombobox
            provider={provider}
            // BYOK rows only carry account capabilities; `decision` is platform-only.
            capability={isModelCatalogCapability(field.catalogCapability) ? field.catalogCapability : "text"}
            value={saved}
            defaultLabel={defaultLabel}
            onChange={(next) => void select(next)}
            disabled={busy}
            placeholder={placeholder}
            useCustomLabel={useCustomLabel}
            loadingLabel={loadingLabel}
          />
          {busy ? <Spinner className="shrink-0" /> : null}
        </div>
      }
    />
  );
}

/** A standalone setting: its label and description come from the catalog. */
function ConfigRow({
  field,
  value,
  onSaved,
}: {
  field: AiConfigField;
  value: string | null;
  onSaved: OnSaved;
}) {
  const t = useTranslations("Admin");
  const label = useFieldLabel()(field);
  // Optional description: a field whose label is sufficient does not have one.
  // Cast: the key is built at runtime and escapes the typed catalog.
  const descKey = `fields.${field.key}.desc` as AdminKey;
  const desc = field.adminLabel ? null : t.has(descKey) ? t(descKey) : null;

  switch (field.kind) {
    case "reasoning":
      return (
        <ReasoningRow field={field} label={label} desc={desc} value={value} onSaved={onSaved} />
      );
    case "modelId":
      return <ModelIdRow field={field} label={label} desc={desc} value={value} onSaved={onSaved} />;
    case "count":
      return <ModelIdRow field={field} label={label} desc={desc} value={value} onSaved={onSaved} numeric />;
    case "engine":
      return <EngineRow field={field} label={label} desc={desc} value={value} onSaved={onSaved} />;
    case "model":
      return (
        <ModelRow
          field={field}
          label={label}
          desc={desc}
          value={value}
          onSaved={onSaved}
        />
      );
  }
}

/**
 * The instance's decision engine (MIN-980), as a switch: on, the language
 * model answers decisions; off, the decision model does. Accounts follow it
 * unless they chose their own.
 */
function EngineRow({
  field,
  label,
  desc,
  value,
  onSaved,
}: {
  field: AiConfigField;
  label: string;
  desc: string | null;
  value: string | null;
  onSaved: OnSaved;
}) {
  const t = useTranslations("Admin");
  const saved = toDecisionEngine(value ?? field.fallback);
  const [busy, setBusy] = useState(false);

  const toggle = async (useLlm: boolean) => {
    const next = useLlm ? "llm" : "model";
    if (busy || next === saved) return;
    setBusy(true);
    try {
      await patchConfig(field.key, next);
      onSaved(field.key, next);
      toast.success(t("saved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsRow
      label={label}
      hint={desc ?? undefined}
      htmlFor={`cfg-${field.key}`}
      control={
        <>
          {busy ? <Spinner className="shrink-0" /> : null}
          <Switch
            id={`cfg-${field.key}`}
            checked={saved === "llm"}
            onCheckedChange={(checked) => void toggle(checked)}
            disabled={busy}
          />
        </>
      }
    />
  );
}

/** The reasoning levels' labels, shared with the composer's picker. */
const REASONING_LABEL_KEYS: Record<ReasoningLevel, MessageKey<"Agent">> = {
  off: "reasoningOff",
  minimal: "reasoningMinimal",
  low: "reasoningLow",
  medium: "reasoningMedium",
  high: "reasoningHigh",
  xhigh: "reasoningXhigh",
  max: "reasoningMax",
};

function ReasoningRow({
  field,
  label,
  desc,
  value,
  onSaved,
}: {
  field: AiConfigField;
  label: string;
  desc: string | null;
  value: string | null;
  onSaved: OnSaved;
}) {
  const t = useTranslations("Admin");
  const tAgent = useTranslations("Agent");
  const saved = toReasoningLevel(value ?? field.fallback);
  const [busy, setBusy] = useState(false);

  const select = async (next: string) => {
    if (busy || next === saved) return;
    setBusy(true);
    try {
      await patchConfig(field.key, next);
      onSaved(field.key, next);
      toast.success(t("saved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsRow
      label={label}
      hint={desc ?? undefined}
      htmlFor={`cfg-${field.key}`}
      control={
        <>
          <Select value={saved} onValueChange={(next) => void select(next)} disabled={busy}>
            <SelectTrigger id={`cfg-${field.key}`} className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONING_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>{tAgent(REASONING_LABEL_KEYS[level])}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {busy ? <Spinner className="shrink-0" /> : null}
        </>
      }
    />
  );
}

/**
 * A template setting. The control is the app picker (`ModelCombobox`,
 * scope `platform`): we choose a BRAND and a NAME — the OpenRouter id does not
 * is not displayed anywhere, it is a transport detail.
 *
 * The catalog comes from the platform key, not from the BYOK of the admin who is viewing:
 * these models run on the platform, an Anthropic id written here would be
 * broken at runtime. Free entry remains available (a model just released
 * may be missing from the catalog), and “default model” clears the setting — it
 * then follows the fault produced instead of being fixed on its current value.
 *
 * No more “Save” button: a choice in a list is a unique act,
 * it registers on selection.
 */
function ModelRow({
  field,
  label,
  desc,
  value,
  onSaved,
}: {
  field: AiConfigField;
  label: string;
  desc: string | null;
  value: string | null;
  onSaved: OnSaved;
}) {
  const t = useTranslations("Admin");
  // The picker labels live in the Agent namespace: it’s the SAME
  // component than that of the agent, all its points of use share them.
  const tAgent = useTranslations("Agent");
  const saved = value ?? "";
  const [busy, setBusy] = useState(false);
  // The decision model is validated against its catalog on save (MIN-694):
  // free entry would only ever offer a value the server refuses.
  const isDecision = field.catalogCapability === "decision";

  const select = async (next: string) => {
    if (busy || next === saved) return;
    setBusy(true);
    try {
      await patchConfig(field.key, next);
      // Only a save the server accepted moves the picker: a refused model is
      // never displayed as the one in use.
      onSaved(field.key, next);
      toast.success(t("saved"));
    } catch (e) {
      const code = e instanceof ConfigSaveError ? e.code : null;
      const key = code ? DECISION_MODEL_ERROR_KEYS[code] : undefined;
      toast.error(key ? t(key) : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsRow
      label={label}
      hint={desc ?? undefined}
      control={
        <div className="flex min-w-0 items-center gap-2">
          <ModelCombobox
            scope="platform"
            capability={field.catalogCapability ?? "text"}
            value={saved}
            onChange={(next) => void select(next)}
            disabled={busy}
            defaultLabel={t("fieldDefault")}
            defaultModelId={field.fallback}
            placeholder={tAgent("modelSearchPlaceholder")}
            emptyLabel={tAgent("modelSearchEmpty")}
            loadingLabel={tAgent("modelSearchLoading")}
            freeTextLabel={
              isDecision ? undefined : (query) => tAgent("modelUseCustom", { model: query })
            }
          />
          {busy ? <Spinner className="shrink-0" /> : null}
        </div>
      }
    />
  );
}

/**
 * A model id ENTERED, not chosen: the border defects of BYOK providers
 * live in the provider namespace (`claude-sonnet-5`, not
 * `anthropic/claude-sonnet-5`), therefore the platform picker — which lists ids
 * OpenRouter — would write broken values ​​to it at runtime. The placeholder shows
 * the product defect; emptying the field returns there.
 */
function ModelIdRow({
  field,
  label,
  desc,
  value,
  onSaved,
  numeric = false,
}: {
  field: AiConfigField;
  label: string;
  desc: string | null;
  value: string | null;
  onSaved: OnSaved;
  /** A `count`: a whole number, empty for the default. */
  numeric?: boolean;
}) {
  const t = useTranslations("Admin");
  const saved = (value ?? "").trim();
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const [busy, setBusy] = useState(false);

  const commit = async () => {
    const trimmed = draft.trim();
    // A count is stored without leading zeros: compare and reflect it the same way.
    const next = numeric && /^\d+$/.test(trimmed) ? String(Number(trimmed)) : trimmed;
    if (busy || next === saved) return;
    setBusy(true);
    try {
      await patchConfig(field.key, next);
      onSaved(field.key, next);
      setDraft(next);
      toast.success(t("saved"));
    } catch (e) {
      setDraft(saved);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsRow
      htmlFor={`cfg-${field.key}`}
      label={label}
      hint={desc ?? undefined}
      control={
        <>
          <Input
            id={`cfg-${field.key}`}
            value={draft}
            placeholder={field.fallback}
            disabled={busy}
            spellCheck={false}
            inputMode={numeric ? "numeric" : undefined}
            className={numeric ? "w-24" : "w-64"}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setDraft(saved);
            }}
          />
          {busy ? <Spinner className="shrink-0" /> : null}
        </>
      }
    />
  );
}
