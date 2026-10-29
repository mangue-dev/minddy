"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, ArrowDown01Icon, Delete02Icon, FileExportIcon, FileImportIcon } from "@hugeicons/core-free-icons";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useLocale, useTranslations} from "next-intl";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MessageKey } from "@/lib/i18n-keys";
import {SettingsGroup, SettingsRow} from "@/components/settings/settings-ui";
import {HelpHint} from "@/components/settings/help-hint";
import {ModelCombobox} from "@/components/agent/model-combobox";
import {ReasoningCombobox} from "@/components/agent/reasoning-combobox";
import {ByokModelCombobox} from "@/components/admin/byok-model-combobox";

import {formatModelName} from "@/lib/model-display";
import {getAgentProvider} from "@/lib/agent-providers";
import {byokProviderFromConfigKey, modelKeyFromByokConfigKey} from "@/lib/byok-model-catalog";
import {isModelCatalogCapability} from "@/lib/model-catalog-capability";
import type {ByokCatalogProvider} from "@/lib/byok-model-catalog";
import {
  AI_MODEL_CONFIG_FIELDS,
  AI_MODEL_CONFIG_GROUPS,
  categoryMembers,
  categoryModelKey,
  getAiConfigField,
  isSuffixableField,
  modelSuffixKey,
  MODEL_SUFFIXES,
} from "@/lib/ai-model-config";
import type {AiConfigField, AiConfigGroup, AiModelCategoryId, ModelSuffix} from "@/lib/ai-model-config";
import {
  buildModelConfigFile,
  type ModelConfigChange,
  type ModelConfigFileError,
} from "@/lib/ai-model-config-file";
import {DEFAULT_RECOMMENDED_MODELS, parseRecommendedModels} from "@/lib/recommended-models";
import {REASONING_LEVELS, toReasoningLevel} from "@/lib/agent-reasoning";
import {formatMultiplier} from "@/lib/model-multiplier";
import {useAgentModelsQuery} from "@/lib/use-agent-models-query";
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

/** Saves one value; returns the seeded task rows a category default took over. */
async function patchConfig(key: string, value: string): Promise<string[]> {
  const res = await fetch("/api/admin/app-config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  const body = (await res.json().catch(() => null)) as
    | { error?: string; code?: string; released?: string[] }
    | null;
  if (!res.ok) {
    throw new ConfigSaveError(body?.error ?? `HTTP ${res.status}`, body?.code ?? null);
  }
  return body?.released ?? [];
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

/** Records `onSaved` callers report: the saved key, plus released task rows. */
type OnSaved = (key: string, value: string, released?: string[]) => void;

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
 * Admin-only screen to choose the AI models minddy runs (MIN-829). Each card
 * is a CATEGORY with one default model; a task follows it until it is
 * overridden, and its row hides under “Per-task models” until asked for.
 * Tasks of a capability alone in their card (decision, transcription, voice
 * cleanup) keep a row of their own. BYOK defaults are folded at the bottom:
 * they only matter to members who use their own provider key. Access is
 * enforced server-side by `app/(app)/admin/layout.tsx` and the API — this is
 * UI only.
 */
export function AdminModelsDashboard() {
  const t = useTranslations("Admin");
  const [values, setValues] = useState<ConfigValues | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/app-config", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { values: ConfigValues };
    return data.values ?? {};
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const next = await load();
        if (alive) setValues(next);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const fieldsByGroup = useMemo(() => {
    const map = Object.fromEntries(AI_MODEL_CONFIG_GROUPS.map((group) => [group, [] as AiConfigField[]])) as Record<
      AiConfigGroup,
      AiConfigField[]
    >;
    for (const f of AI_MODEL_CONFIG_FIELDS) if (f.kind !== "recommended") map[f.group].push(f);
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
  // resets; released task rows now follow their category.
  const onSaved = useCallback<OnSaved>((key, value, released = []) => {
    setValues((prev) => ({
      ...prev,
      [key]: value,
      ...Object.fromEntries(released.map((releasedKey) => [releasedKey, null])),
    }));
  }, []);

  const reload = useCallback(async () => {
    setValues(await load());
  }, [load]);

  const recommendedField = getAiConfigField("recommended_models")!;

  return (
    /* Width and margins inherited from the shell (`admin-dashboard`). */
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <ModelsFileActions values={values} onImported={reload} />
      </header>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {t("loadError")}
        </div>
      ) : (
        /* It's literally a settings screen: one card per category, one row
           per setting. Same grammar as /settings (MIN-167). */
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

          <SettingsGroup
            id={adminSectionAnchor(ADMIN_SECTIONS.modelsRecommended)}
            title={t("fields.recommended_models.label")}
            help={t("fields.recommended_models.desc")}
          >
            {values === null ? (
              <RowSkeleton />
            ) : (
              <RecommendedRow
                field={recommendedField}
                value={values.recommended_models ?? null}
                onSaved={onSaved}
              />
            )}
          </SettingsGroup>

          <ByokSection byokByProvider={byokByProvider} values={values} onSaved={onSaved} />
        </div>
      )}
    </div>
  );
}

/** The search destination of each card (lib/admin-sections.ts). */
const MODEL_GROUP_ANCHORS: Record<AiConfigGroup, AdminSectionId> = {
  assistant: ADMIN_SECTIONS.modelsAssistant,
  automations: ADMIN_SECTIONS.modelsAutomations,
  embeddings: ADMIN_SECTIONS.modelsEmbeddings,
  voice: ADMIN_SECTIONS.modelsVoice,
  feedback: ADMIN_SECTIONS.modelsFeedback,
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

/**
 * One card: the category default first, then the settings that stand alone
 * in it, then the tasks folded under “Per-task models”.
 */
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
  const categoryField = fields.find((field) => field.categoryDefault);
  const category = categoryField?.categoryDefault;
  const standalone = fields.filter((field) => !field.categoryDefault && !field.category);
  const loading = values === null;
  const descKey = `groups.${group}.desc` as AdminKey;

  return (
    <SettingsGroup
      id={adminSectionAnchor(MODEL_GROUP_ANCHORS[group])}
      title={t(`groups.${group}.title`)}
      help={t.has(descKey) ? t(descKey) : undefined}
    >
      {loading ? (
        <RowSkeleton />
      ) : categoryField && category ? (
        <CategoryDefaultRow field={categoryField} category={category} values={values} onSaved={onSaved} />
      ) : null}
      {standalone.map((field) =>
        loading ? (
          <RowSkeleton key={field.key} />
        ) : (
          <ConfigRow
            key={field.key}
            field={field}
            value={values?.[field.key] ?? null}
            suffix={values?.[modelSuffixKey(field.key)] ?? null}
            onSaved={onSaved}
          />
        ),
      )}
      {!loading && category ? (
        <TaskOverrides category={category} values={values} onSaved={onSaved} />
      ) : null}
    </SettingsGroup>
  );
}

/**
 * Whether a task really uses its own model. A row equal to the task's
 * built-in default, without a shortcut, while the category is unset runs
 * exactly like no row at all: it is a seeded row, not a choice, and setting
 * the category releases it (`lib/server/admin-model-config.ts`).
 */
function isOverride(field: AiConfigField, values: ConfigValues): boolean {
  const own = values[field.key]?.trim();
  if (!own) return false;
  const categorySet = field.category ? !!values[categoryModelKey(field.category)]?.trim() : false;
  return categorySet || own !== field.fallback || !!values[modelSuffixKey(field.key)]?.trim();
}

/** The model a task runs on while it follows its category. */
function inheritedModel(field: AiConfigField, values: ConfigValues): string {
  const category = field.category;
  return (category ? values[categoryModelKey(category)]?.trim() : "") || field.fallback;
}

function CategoryDefaultRow({
  field,
  category,
  values,
  onSaved,
}: {
  field: AiConfigField;
  category: AiModelCategoryId;
  values: ConfigValues;
  onSaved: OnSaved;
}) {
  const t = useTranslations("Admin");
  // Unset, a category hands each task its own built-in default. When they
  // all share one, it is the one to show; otherwise the label says so.
  const fallbacks = [...new Set(categoryMembers(category).map((member) => member.fallback))];
  const sharedFallback = fallbacks.length === 1 ? fallbacks[0] : null;
  return (
    <ModelRow
      field={field}
      label={t("categoryDefault.label")}
      desc={t(`categoryDefault.hint_${category}`)}
      value={values[field.key] ?? null}
      suffix={values[modelSuffixKey(field.key)] ?? null}
      defaultLabel={sharedFallback ? t("fieldDefault") : t("categoryDefault.builtIn")}
      defaultModelId={sharedFallback}
      onSaved={onSaved}
    />
  );
}

/**
 * The tasks of a category, folded by default: most instances never need to
 * pin one. The trigger counts the overrides, so a pinned task never hides.
 */
function TaskOverrides({
  category,
  values,
  onSaved,
}: {
  category: AiModelCategoryId;
  values: ConfigValues;
  onSaved: OnSaved;
}) {
  const t = useTranslations("Admin");
  const label = useFieldLabel();
  const members = categoryMembers(category);
  const overridden = members.filter((field) => isOverride(field, values)).length;
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="py-1">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-md py-2.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{t("categoryDefault.tasks", { count: members.length })}</span>
          <span className="text-xs text-muted-foreground">
            {t("categoryDefault.overridden", { count: overridden })}
          </span>
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="divide-y divide-border border-t border-border">
          {members.map((field) => {
            const own = values[field.key]?.trim() ?? "";
            const overrides = isOverride(field, values);
            const descKey = `fields.${field.key}.desc` as AdminKey;
            return (
              <ModelRow
                key={field.key}
                field={field}
                label={label(field)}
                desc={
                  overrides
                    ? t("categoryDefault.overrides")
                    : t.has(descKey)
                      ? t(descKey)
                      : t("categoryDefault.follows")
                }
                value={own}
                suffix={values[modelSuffixKey(field.key)] ?? null}
                // The suffix of a task that follows its category is the
                // category's: offering the task's own would mean nothing.
                showSuffix={!!own || !!values[modelSuffixKey(field.key)]?.trim()}
                defaultLabel={t("categoryDefault.useDefault")}
                defaultModelId={inheritedModel(field, values)}
                onSaved={onSaved}
              />
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
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
                      suffix={null}
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
      const suffixOf = AI_MODEL_CONFIG_FIELDS.find((field) => modelSuffixKey(field.key) === key);
      const field = suffixOf ?? getAiConfigField(key);
      if (!field) return key;
      const name = field.categoryDefault
        ? `${t(`groups.${field.group}.title`)} · ${t("categoryDefault.label")}`
        : label(field);
      return suffixOf ? `${name} · ${t("suffix.label")}` : name;
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
    <div id={adminSectionAnchor(ADMIN_SECTIONS.modelsFile)} className="flex shrink-0 scroll-mt-20 items-center gap-2 rounded-lg">
      <Button variant="outline" size="sm" onClick={exportFile} disabled={!values}>
        <HugeiconsIcon icon={FileExportIcon} className="size-4" />
        {t("modelsFile.export")}
      </Button>
      <Button variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy || !values}>
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
              {t("modelsFile.cancel")}
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
  suffix,
  onSaved,
}: {
  field: AiConfigField;
  value: string | null;
  /** OpenRouter routing suffix for the field, when it accepts one (MIN-263). */
  suffix: string | null;
  onSaved: OnSaved;
}) {
  const t = useTranslations("Admin");
  const label = useFieldLabel()(field);
  // Optional description: a field whose label is sufficient does not have one.
  // Cast: the key is built at runtime and escapes the typed catalog.
  const descKey = `fields.${field.key}.desc` as AdminKey;
  const desc = field.adminLabel ? null : t.has(descKey) ? t(descKey) : null;

  switch (field.kind) {
    case "recommended":
      return <RecommendedRow field={field} value={value} onSaved={onSaved} />;
    case "reasoning":
      return (
        <ReasoningRow field={field} label={label} desc={desc} value={value} onSaved={onSaved} />
      );
    case "modelId":
      return <ModelIdRow field={field} label={label} desc={desc} value={value} onSaved={onSaved} />;
    case "model":
      return (
        <ModelRow
          field={field}
          label={label}
          desc={desc}
          value={value}
          suffix={suffix}
          onSaved={onSaved}
        />
      );
  }
}

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
      control={
        <div className="flex w-full items-center gap-2 sm:w-64">
          <ReasoningCombobox
            value={saved}
            levels={REASONING_LEVELS}
            disabled={busy}
            variant="field"
            onChange={(next) => void select(next)}
          />
          {busy ? <Spinner className="shrink-0" /> : null}
        </div>
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
 *
 * Below, the OpenRouter routing shortcut (MIN-263): it does NOT change
 * model, it orders the providers of that one. Hence the second list rather
 * only an extended id in the first — and “None” by default.
 */
function ModelRow({
  field,
  label,
  desc,
  value,
  suffix,
  showSuffix = true,
  defaultLabel,
  defaultModelId,
  onSaved,
}: {
  field: AiConfigField;
  label: string;
  desc: string | null;
  value: string | null;
  suffix: string | null;
  /** A task that follows its category is served the category's way. */
  showSuffix?: boolean;
  /** What “no value” means here: the built-in default, or the category's. */
  defaultLabel?: string;
  defaultModelId?: string | null;
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
      const released = await patchConfig(field.key, next);
      // Only a save the server accepted moves the picker: a refused model is
      // never displayed as the one in use.
      onSaved(field.key, next, released);
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
        /* The two lists one UNDER the other: side by side, they pushed the
 row beyond the width of the map (the control container of
 `SettingsRow` is `shrink-0`, nothing gives way). The shortcut is framed to the right, under the model it accompanies — the reading remains “this model, served like that”. */
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <div className="flex min-w-0 items-center gap-2">
            <ModelCombobox
              scope="platform"
              capability={field.catalogCapability ?? "text"}
              value={saved}
              onChange={(next) => void select(next)}
              disabled={busy}
              defaultLabel={defaultLabel ?? t("fieldDefault")}
              defaultModelId={defaultModelId === undefined ? field.fallback : defaultModelId}
              placeholder={tAgent("modelSearchPlaceholder")}
              emptyLabel={tAgent("modelSearchEmpty")}
              loadingLabel={tAgent("modelSearchLoading")}
              freeTextLabel={
                isDecision ? undefined : (query) => tAgent("modelUseCustom", { model: query })
              }
            />
            {busy ? <Spinner className="shrink-0" /> : null}
          </div>
          {showSuffix && isSuffixableField(field) ? (
            <SuffixSelect field={field} value={suffix} onSaved={onSaved} />
          ) : null}
        </div>
      }
    />
  );
}

/** Value of `Select` for “no shortcut” (an item cannot be empty). */
const NO_SUFFIX = "__none__";

/** Shortcut labels — typed table, no key assembled at runtime. */
const SUFFIX_LABEL_KEYS: Record<ModelSuffix, AdminKey> = {
  nitro: "suffix.nitro",
  floor: "suffix.floor",
  exacto: "suffix.exacto",
};

/**
 * A template's OpenRouter routing shortcut (`:nitro`, `:floor`,
 * `:exacto`). It registers on its OWN `app_config` key — never in the id
 * of the model — so that the catalog, display and price continue to see
 * a bare id, and so that removing it does not affect the chosen model.
 */
function SuffixSelect({
  field,
  value,
  onSaved,
}: {
  field: AiConfigField;
  value: string | null;
  onSaved: OnSaved;
}) {
  const t = useTranslations("Admin");
  const key = modelSuffixKey(field.key);
  const saved = (value ?? "").trim();
  const [busy, setBusy] = useState(false);

  const select = async (next: string) => {
    const wanted = next === NO_SUFFIX ? "" : next;
    if (busy || wanted === saved) return;
    setBusy(true);
    try {
      await patchConfig(key, wanted);
      onSaved(key, wanted);
      toast.success(t("saved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Select
      value={saved || NO_SUFFIX}
      disabled={busy}
      onValueChange={(next) => void select(next)}
    >
      {/* As wide as its label (`w-max`): sized by the column, a long label
          such as the French “no preference” was clipped. */}
      <SelectTrigger className="w-full shrink-0 sm:w-max sm:min-w-36" aria-label={t("suffix.label")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_SUFFIX}>{t("suffix.none")}</SelectItem>
        {MODEL_SUFFIXES.map((suffix) => (
          <SelectItem key={suffix} value={suffix}>
            {t(SUFFIX_LABEL_KEYS[suffix])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
}: {
  field: AiConfigField;
  label: string;
  desc: string | null;
  value: string | null;
  onSaved: OnSaved;
}) {
  const t = useTranslations("Admin");
  const saved = (value ?? "").trim();
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const [busy, setBusy] = useState(false);

  const commit = async () => {
    const next = draft.trim();
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
            className="w-64"
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

/**
 * The list of RECOMMENDED models: what the user's picker shows on
 * opening, before any keystroke (see lib/recommended-models.ts). An id is
 * enough: the picker already knows how to display a name, a logo and a cost.
 *
 * What we regulate here is a SET, not a sequence: the ORDER is calculated,
 * from least expensive to most expensive, here as in the picker (`resolveRecommended`).
 * This is the only order that remains true — OpenRouter prices move, and a
 * sequence arranged by hand would end up announcing a cost scale which
 * no longer exists. Hence the absence of arrows, and the multiplier in front of
 * each line: it is he who explains the rank.
 *
 * A model for which we do not know the price is placed at the end of the list, due to lack of
 * know where to put it — same rule on both sides.
 *
 * Saved IN BATCH: a half-rewritten list is not a state we want to serve.
 * “Reset” clears the `app_config` line — the setting again follows the
 * product default instead of staying stuck on the selection of the day.
 */
function RecommendedRow({
  field,
  value,
  onSaved,
}: {
  field: AiConfigField;
  value: string | null;
  onSaved: OnSaved;
}) {
  const t = useTranslations("Admin");
  const tAgent = useTranslations("Agent");
  const locale = useLocale();
  // The platform catalog carries the multipliers (see getAdminModelCatalog):
  // it is he who gives the price of each line, therefore its rank. Same key
  // query as the screen pickers — no more queries.
  const { models } = useAgentModelsQuery("platform");
  const saved = (value ?? "").trim();
  // The SAME parser as the runtime: what the screen shows is what the picker will read.
  const savedList = useMemo(
    () => parseRecommendedModels(saved) ?? DEFAULT_RECOMMENDED_MODELS,
    [saved],
  );
  const [list, setList] = useState<string[]>(savedList);
  useEffect(() => setList(savedList), [savedList]);
  const [busy, setBusy] = useState(false);

  const multiplierOf = useCallback(
    (id: string) => models.find((m) => m.id === id)?.multiplier ?? null,
    [models],
  );

  /**
   * Display order: least expensive first, as the picker will serve it.
   *
   * EMPTY lines (an “Add” that has not yet been filled) remain in effect.
   * queue whatever happens — sort them by a price they don't have
   * would jump from one end of the list to the other while filling them out.
   */
  const ordered = useMemo(() => {
    const rank = (id: string) => (id ? (multiplierOf(id) ?? Infinity) : Number.MAX_VALUE);
    return [...list].sort(
      (a, b) => Number(!a) - Number(!b) || rank(a) - rank(b) || a.localeCompare(b),
    );
  }, [list, multiplierOf]);

  // What we settle is a SET: two lists that have the same models
  // are the same list, whatever their order — it is the price that fixes it.
  // Comparing sequences would flash “modified” with each reordering
  // sorting, without anyone having touched anything.
  const asSet = (ids: string[]) => [...ids].sort().join("\n");
  const dirty = asSet(list) !== asSet(savedList);
  const incomplete = list.some((id) => !id);
  // A duplicate id would not make two lines, it would make one that flashes:
  // `parseRecommendedModels` deduplicates, so the record would lose
  // silently a line that the admin still sees on the screen.
  const duplicate = new Set(list.filter(Boolean)).size !== list.filter(Boolean).length;

  const write = async (next: string) => {
    if (busy) return;
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

  // Emptied list = return to product fallback: we delete the line rather than
  // to save an empty array, which the runtime would replace anyway.
  // Saved IN THE ORDER displayed: the server resorts anyway, but a
  // line `app_config` that is reread by hand reads more neatly.
  const save = () => void write(ordered.length > 0 ? JSON.stringify(ordered) : "");

  return (
    <div className="flex flex-col gap-3 py-3.5">
      <p className="text-xs text-muted-foreground">{t("recommended.hint")}</p>
      <div className="space-y-2">
        {ordered.map((id, index) => (
          <div key={id || `empty-${index}`} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <ModelCombobox
                scope="platform"
                value={id}
                // Replacement by IDENTITY, not by rank: the edited line is not
                // not at index `index` of `list`, since `ordered` is sorted.
                onChange={(next) =>
                  setList((prev) => {
                    const at = prev.indexOf(id);
                    return at < 0 ? [...prev, next] : prev.map((v, i) => (i === at ? next : v));
                  })
                }
                disabled={busy}
                defaultLabel={t("recommended.pickModel")}
                placeholder={tAgent("modelSearchPlaceholder")}
                emptyLabel={tAgent("modelSearchEmpty")}
                loadingLabel={tAgent("modelSearchLoading")}
                freeTextLabel={(query) => tAgent("modelUseCustom", { model: query })}
              />
            </div>
            {/* Which explains the rank. Silent on a model that the catalog does not
 not located — this one is in the queue due to lack of price, not by choice. */}
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {multiplierOf(id) != null ? formatMultiplier(multiplierOf(id)!, locale) : null}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground"
              disabled={busy}
              aria-label={t("recommended.remove")}
              onClick={() =>
                setList((prev) => {
                  const at = prev.indexOf(id);
                  return at < 0 ? prev : prev.filter((_, i) => i !== at);
                })
              }
            >
              <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            </Button>
          </div>
        ))}

        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("recommended.empty")}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {/* Locked as long as a line is empty: the lines are marked by
 their id, and two empty lines would be two indistinguishable lines
 — editing the second would modify the first. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || incomplete}
            onClick={() => setList((prev) => [...prev, ""])}
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            {t("recommended.add")}
          </Button>
          {dirty ? (
            <>
              <Button
                type="button"
                size="sm"
                disabled={busy || incomplete || duplicate}
                onClick={save}
              >
                {t("recommended.save")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setList(savedList)}
              >
                {t("recommended.cancel")}
              </Button>
            </>
          ) : saved ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void write("")}
            >
              {t("recommended.reset")}
            </Button>
          ) : null}
          {busy ? <Spinner className="shrink-0" /> : null}
        </div>
        {incomplete ? (
          <p className="text-xs text-muted-foreground">{t("recommended.incomplete")}</p>
        ) : null}
        {duplicate ? (
          <p className="text-xs text-muted-foreground">{t("recommended.duplicate")}</p>
        ) : null}
      </div>
    </div>
  );
}
