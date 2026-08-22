"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Bot,
  KeyRound,
  MessageSquareHeart,
  Mic,
  Plus,
  Sparkles,
  Trash2,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Spinner,
  Switch,
  Textarea,
  toast,
} from "mangue-ui";
import type { MessageKey } from "@/lib/i18n-keys";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { HelpHint } from "@/components/settings/help-hint";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { ByokModelCombobox } from "@/components/admin/byok-model-combobox";
import { ProviderLogo } from "@/components/model-logo";
import { formatModelName } from "@/lib/model-display";
import { getAgentProvider } from "@/lib/agent-providers";
import {
  byokProviderFromConfigKey,
  modelKeyFromByokConfigKey,
  type ByokCatalogProvider,
} from "@/lib/byok-model-catalog";
import {
  AI_MODEL_CONFIG_FIELDS,
  AI_MODEL_CONFIG_GROUPS,
  isSuffixableField,
  modelSuffixKey,
  MODEL_SUFFIXES,
  type AiConfigField,
  type AiConfigGroup,
  type ModelSuffix,
} from "@/lib/ai-model-config";
import {
  DEFAULT_SUBAGENT_FAVORITES,
  parseSubagentFavorites,
  SUBAGENT_THINKING_EFFORTS,
  type FavoriteSubagentModel,
  type SubagentThinkingEffort,
} from "@/lib/subagent-favorites";
import { DEFAULT_RECOMMENDED_MODELS, parseRecommendedModels } from "@/lib/recommended-models";
import { formatMultiplier } from "@/lib/model-multiplier";
import { useAgentModelsQuery } from "@/lib/use-agent-models-query";

type ConfigValues = Record<string, string | null>;

/** Key for the `Admin` namespace. Used for keys assembled at runtime, which must
 * be explicitly cast there (convention: cf. lib/i18n-keys.ts). */
type AdminKey = MessageKey<"Admin">;

async function patchConfig(key: string, value: string): Promise<void> {
  const res = await fetch("/api/admin/app-config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
}

/**
 * Admin-only dashboard to edit the AI models minddy runs from `app_config`.
 * Platform rows are chosen in the OpenRouter catalog (`ModelCombobox`); BYOK
 * defaults are grouped one card per provider and picked in that provider's
 * native namespace (`ByokModelCombobox`, MIN-416). The feedback
 * classification flag is a switch that saves immediately. Access is enforced
 * server-side by `app/(app)/admin/layout.tsx` and the API — this is UI only.
 */
export function AdminModelsDashboard() {
  const t = useTranslations("Admin");
  const [values, setValues] = useState<ConfigValues | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/app-config");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { values: ConfigValues };
        if (alive) setValues(data.values ?? {});
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const fieldsByGroup = useMemo(() => {
    const map: Record<AiConfigGroup, AiConfigField[]> = {
      assistant: [],
      automations: [],
      agent: [],
      byok: [],
      voice: [],
      feedback: [],
    };
    for (const f of AI_MODEL_CONFIG_FIELDS) map[f.group].push(f);
    return map;
  }, []);

  // The BYOK group is not rendered flat: one section per provider (MIN-416),
  // so the admin sees each vendor's namespace as a unit instead of a mixed
  // list where "OpenAI · transcription_model" sits next to Google rows.
  // Fields of a provider without catalog support (generic) stay in the
  // leftover bucket and render as free-text rows.
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

  // Reflect a saved value back into local state so the row's dirty check resets.
  const onSaved = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  return (
    /* Width and margins inherited from shell (`admin-dashboard`) — only one
 container for all four tabs. */
    <div className="space-y-8">
      <header>
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {t("loadError")}
        </div>
      ) : (
        /* It's literally a settings screen: one group per family, one
 field per row. Same grammar as /settings (MIN-167). */
        <div className="flex flex-col gap-4">
          {AI_MODEL_CONFIG_GROUPS.filter((group) => group !== "byok").map((group) => (
            <SettingsGroup
              key={group}
              icon={GROUP_ICONS[group]}
              title={t(`groups.${group}.title`)}
              // Optional description: some groups explain themselves through
              // the descriptions of their fields.
              description={
                // Cast: the key only exists for certain groups (2 out of 4),
                // what the guy can't say — `t.has` is the safeguard,
                // at execution.
                t.has(`groups.${group}.desc` as AdminKey)
                  ? t(`groups.${group}.desc` as AdminKey)
                  : undefined
              }
            >
              {fieldsByGroup[group].map((field) => (
                <ConfigRow
                  key={field.key}
                  field={field}
                  value={values?.[field.key] ?? null}
                  suffix={values?.[modelSuffixKey(field.key)] ?? null}
                  loading={values === null}
                  onSaved={onSaved}
                />
              ))}
            </SettingsGroup>
          ))}

          {/* ── Personal keys: one modular section per BYOK provider ── */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-1.5 px-0.5">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                {t("groups.byok.title")}
              </h2>
              <HelpHint>{t("groups.byok.desc")}</HelpHint>
            </div>
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
              <SettingsGroup icon={KeyRound} title={t("groups.byokOther")}>
                {byokByProvider.other.map((field) => (
                  <ConfigRow
                    key={field.key}
                    field={field}
                    value={values?.[field.key] ?? null}
                    suffix={null}
                    loading={values === null}
                    onSaved={onSaved}
                  />
                ))}
              </SettingsGroup>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}

/** Section icon of each model-config family — same grammar as /settings. */
const GROUP_ICONS: Record<AiConfigGroup, LucideIcon> = {
  assistant: Sparkles,
  automations: Workflow,
  agent: Bot,
  byok: KeyRound,
  voice: Mic,
  feedback: MessageSquareHeart,
};

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
  onSaved: (key: string, value: string) => void;
}) {
  const t = useTranslations("Admin");
  const tAgent = useTranslations("Agent");
  // The border default (`byok_default_model_<provider>`) leads; the per-call
  // keys follow in registry order.
  const ordered = useMemo(
    () =>
      [...fields].sort(
        (a, b) => Number(!a.key.startsWith("byok_default_model_")) - Number(!b.key.startsWith("byok_default_model_")),
      ),
    [fields],
  );

  return (
    <SettingsGroup
      avatar={<ProviderLogo provider={provider} size={16} />}
      title={getAgentProvider(provider)?.label ?? provider}
    >
      {ordered.map((field) => {
        const isBorderDefault = field.key.startsWith("byok_default_model_");
        // Feature rows speak the label of THEIR call type ("Assistant",
        // "Voice dictation"…); inside a provider-titled section that reads
        // better than the generated "Provider · key" label of the flat list.
        const modelKey = modelKeyFromByokConfigKey(field.key);
        const label = isBorderDefault
          ? t("byok.borderDefault")
          : modelKey
            ? t(`fields.${modelKey}.label` as AdminKey)
            : (field.adminLabel ?? t(`fields.${field.key}.label` as AdminKey));
        return (
          <ByokModelRow
            key={field.key}
            field={field}
            provider={provider}
            isBorderDefault={isBorderDefault}
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
  onSaved: (key: string, value: string) => void;
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

function ConfigRow({
  field,
  value,
  suffix,
  loading,
  onSaved,
}: {
  field: AiConfigField;
  value: string | null;
  /** OpenRouter routing suffix for the field, when it accepts one (MIN-263). */
  suffix: string | null;
  loading: boolean;
  onSaved: (key: string, value: string) => void;
}) {
  const t = useTranslations("Admin");
  // Casts: `field.key` comes from the server config, so the key is built at
  // execution and escapes the typed catalog (see lib/i18n-keys.ts).
  const label = field.adminLabel ?? t(`fields.${field.key}.label` as AdminKey);
  // Optional description: a field whose label is sufficient does not have one.
  const descKey = `fields.${field.key}.desc` as AdminKey;
  const desc = field.adminLabel ? null : t.has(descKey) ? t(descKey) : null;

  if (loading) {
    return (
      <div className="flex flex-col gap-2 py-3.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-full max-w-md" />
      </div>
    );
  }

  switch (field.kind) {
    case "flag":
      return <FlagRow field={field} label={label} desc={desc} value={value} onSaved={onSaved} />;
    case "favorites":
      return (
        <FavoritesRow field={field} label={label} desc={desc} value={value} onSaved={onSaved} />
      );
    case "recommended":
      return (
        <RecommendedRow field={field} label={label} desc={desc} value={value} onSaved={onSaved} />
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
 * it registers on selection (like the `FlagRow` switch).
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
  onSaved,
}: {
  field: AiConfigField;
  label: string;
  desc: string | null;
  value: string | null;
  suffix: string | null;
  onSaved: (key: string, value: string) => void;
}) {
  const t = useTranslations("Admin");
  // The picker labels live in the Agent namespace: it’s the SAME
  // component than that of the agent, all its points of use share them.
  const tAgent = useTranslations("Agent");
  const saved = value ?? "";
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
        /* The two lists one UNDER the other: side by side, they pushed the
 row beyond the width of the map (the control container of
 `SettingsRow` is `shrink-0`, nothing gives way). The shortcut is framed to the right, under the model it accompanies — the reading remains “this model, served like that”. */
        <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-end">
          <div className="flex min-w-0 items-center gap-2">
            <ModelCombobox
              scope="platform"
              value={saved}
              onChange={(next) => void select(next)}
              disabled={busy}
              defaultLabel={t("fieldDefault")}
              defaultModelId={field.fallback}
              placeholder={tAgent("modelSearchPlaceholder")}
              emptyLabel={tAgent("modelSearchEmpty")}
              loadingLabel={tAgent("modelSearchLoading")}
              freeTextLabel={(query) => tAgent("modelUseCustom", { model: query })}
            />
            {busy ? <Spinner className="shrink-0" /> : null}
          </div>
          {isSuffixableField(field) ? (
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
  onSaved: (key: string, value: string) => void;
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
      <SelectTrigger className="w-full shrink-0 sm:w-36" aria-label={t("suffix.label")}>
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

function FlagRow({
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
  onSaved: (key: string, value: string) => void;
}) {
  const resolved = (value ?? field.fallback) === "true";
  const [checked, setChecked] = useState(resolved);
  useEffect(() => setChecked(resolved), [resolved]);

  const toggle = async (next: boolean) => {
    setChecked(next); // optimistic
    try {
      await patchConfig(field.key, next ? "true" : "false");
      onSaved(field.key, next ? "true" : "false");
    } catch (e) {
      setChecked(!next);
      toast.error((e as Error).message);
    }
  };

  return (
    <SettingsRow
      htmlFor={`cfg-${field.key}`}
      label={label}
      hint={desc ?? undefined}
      control={
        <Switch
          id={`cfg-${field.key}`}
          checked={checked}
          onCheckedChange={(v) => void toggle(v)}
        />
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
}: {
  field: AiConfigField;
  label: string;
  desc: string | null;
  value: string | null;
  onSaved: (key: string, value: string) => void;
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

/** Value of `Select` for “no recommended level” (an item cannot be empty). */
const INHERIT_EFFORT = "__inherit__";

/** Reflection level label keys — typed table, no assembled key. */
const EFFORT_LABEL_KEYS: Record<SubagentThinkingEffort, AdminKey> = {
  low: "favorites.effortLow",
  medium: "favorites.effortMedium",
  high: "favorites.effortHigh",
};

/**
 * The “Favorites for sub-agents” list (MIN-112): what the parent agent reads in
 * its prompt to decide what to start a girl on.
 *
 * Two things distinguish it from other lines. First it is recorded IN BATCH:
 * a favorite is only useful when complete (the model without its usage advice says nothing),
 * therefore “Save” button rather than a recording of your choice. Then the
 * `use_case` is from the PROMPT, not from the UI: it leaves as is in the system prompt of the
 * parent — written in English, and addressed to a model who chooses, not to a human who
 * bed. “Reset” clears the `app_config` line: the setting follows the
 * defect produced instead of being fixed on its current value.
 */
function FavoritesRow({
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
  onSaved: (key: string, value: string) => void;
}) {
  const t = useTranslations("Admin");
  const tAgent = useTranslations("Agent");
  const saved = (value ?? "").trim();
  // The SAME parser as the runtime: what the screen shows is what the agent will read.
  const savedList = useMemo(
    () => parseSubagentFavorites(saved) ?? DEFAULT_SUBAGENT_FAVORITES,
    [saved],
  );
  const [list, setList] = useState<FavoriteSubagentModel[]>(savedList);
  useEffect(() => setList(savedList), [savedList]);
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify(list) !== JSON.stringify(savedList);
  const incomplete = list.some((f) => !f.id);

  const patchAt = (index: number, next: Partial<FavoriteSubagentModel>) =>
    setList((prev) => prev.map((f, i) => (i === index ? { ...f, ...next } : f)));

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
  const save = () => void write(list.length > 0 ? JSON.stringify(list) : "");

  return (
    /* The only vertical row on the dashboard: a LIST of favorites, with
 its own long text — it doesn't fit at the end of one line. */
    <SettingsRow label={label} hint={desc ?? undefined} orientation="vertical">
      <div className="space-y-3">
        {list.map((favorite, index) => (
          <div
            key={index}
            className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3"
          >
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <ModelCombobox
                  scope="platform"
                  value={favorite.id}
                  onChange={(id) =>
                    patchAt(index, { id, label: formatModelName(id) || id })
                  }
                  disabled={busy}
                  defaultLabel={t("favorites.pickModel")}
                  placeholder={tAgent("modelSearchPlaceholder")}
                  emptyLabel={tAgent("modelSearchEmpty")}
                  loadingLabel={tAgent("modelSearchLoading")}
                  freeTextLabel={(query) => tAgent("modelUseCustom", { model: query })}
                />
              </div>
              <Select
                value={favorite.thinking_effort ?? INHERIT_EFFORT}
                disabled={busy}
                onValueChange={(next) =>
                  patchAt(index, {
                    thinking_effort:
                      next === INHERIT_EFFORT ? undefined : (next as SubagentThinkingEffort),
                  })
                }
              >
                <SelectTrigger className="w-40 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={INHERIT_EFFORT}>{t("favorites.effortInherit")}</SelectItem>
                  {SUBAGENT_THINKING_EFFORTS.map((effort) => (
                    <SelectItem key={effort} value={effort}>
                      {t(EFFORT_LABEL_KEYS[effort])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground"
                disabled={busy}
                aria-label={t("favorites.remove")}
                onClick={() => setList((prev) => prev.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <Textarea
              value={favorite.use_case}
              disabled={busy}
              rows={2}
              spellCheck={false}
              placeholder={t("favorites.useCasePlaceholder")}
              onChange={(e) => patchAt(index, { use_case: e.target.value })}
            />
          </div>
        ))}

        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("favorites.empty")}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setList((prev) => [...prev, { id: "", label: "", use_case: "" }])}
          >
            <Plus className="size-4" />
            {t("favorites.add")}
          </Button>
          {dirty ? (
            <>
              <Button type="button" size="sm" disabled={busy || incomplete} onClick={save}>
                {t("favorites.save")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setList(savedList)}
              >
                {t("favorites.cancel")}
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
              {t("favorites.reset")}
            </Button>
          ) : null}
          {busy ? <Spinner className="shrink-0" /> : null}
        </div>
        {incomplete ? (
          <p className="text-xs text-muted-foreground">{t("favorites.incomplete")}</p>
        ) : null}
      </div>
    </SettingsRow>
  );
}

/**
 * The list of RECOMMENDED models: what the user's picker shows
 * opening, before any keystroke (see lib/recommended-models.ts).
 *
 * Not to be confused with the favorites just above, despite the resemblance of
 * the screen: the favorites are from PROMPT, read by a parent agent who chooses on
 * what to throw a girl; these are from the UI, read by a human. Hence the form
 * poorer — an id is enough, there is neither usage advice to write nor level of
 * reflection to be resolved, the picker already knows how to display a name, a logo and a cost.
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
 * BATCH saving like favorites, for the same reason: a list to
 * half rewritten is not a state we want to serve. “Reset” clears
 * the `app_config` line — the setting again follows the fault produced instead
 * to be stuck on the selection of the day.
 */
function RecommendedRow({
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
  onSaved: (key: string, value: string) => void;
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
    <SettingsRow label={label} hint={desc ?? undefined} orientation="vertical">
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
              <Trash2 className="size-4" />
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
            <Plus className="size-4" />
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
    </SettingsRow>
  );
}
