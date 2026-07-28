"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Separator, Skeleton, Spinner, Switch, toast } from "mangue-ui";
import type { MessageKey } from "@/lib/i18n-keys";
import { SettingsSection } from "@/components/settings-shell";
import { ModelCombobox } from "@/components/agent/model-combobox";
import {
  AI_MODEL_CONFIG_FIELDS,
  AI_MODEL_CONFIG_GROUPS,
  type AiConfigField,
  type AiConfigGroup,
} from "@/lib/ai-model-config";

type ConfigValues = Record<string, string | null>;

/** Clé du namespace `Admin`. Sert aux clés assemblées à l'exécution, qui doivent
 *  y être castées explicitement (convention : cf. lib/i18n-keys.ts). */
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
 * Model rows are free-text `provider/model` ids saved on demand; the feedback
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
      agent: [],
      voice: [],
      feedback: [],
    };
    for (const f of AI_MODEL_CONFIG_FIELDS) map[f.group].push(f);
    return map;
  }, []);

  // Reflect a saved value back into local state so the row's dirty check resets.
  const onSaved = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...(prev ?? {}), [key]: value }));
  }, []);

  return (
    /* Largeur et marges héritées du shell (`admin-dashboard`) — un seul
       conteneur pour les quatre onglets. */
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
        <div className="space-y-10">
          {AI_MODEL_CONFIG_GROUPS.map((group, i) => (
            <div key={group} className="space-y-10">
              {i > 0 && <Separator />}
              <SettingsSection
                title={t(`groups.${group}.title`)}
                // Description optionnelle : certains groupes s'expliquent par
                // les descriptions de leurs champs.
                description={
                  // Cast : la clé n'existe que pour certains groupes (2 sur 4),
                  // ce que le type ne sait pas dire — `t.has` est le garde-fou,
                  // à l'exécution.
                  t.has(`groups.${group}.desc` as AdminKey)
                    ? t(`groups.${group}.desc` as AdminKey)
                    : undefined
                }
              >
                <div className="space-y-6">
                  {fieldsByGroup[group].map((field) => (
                    <ConfigRow
                      key={field.key}
                      field={field}
                      value={values?.[field.key] ?? null}
                      loading={values === null}
                      onSaved={onSaved}
                    />
                  ))}
                </div>
              </SettingsSection>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfigRow({
  field,
  value,
  loading,
  onSaved,
}: {
  field: AiConfigField;
  value: string | null;
  loading: boolean;
  onSaved: (key: string, value: string) => void;
}) {
  const t = useTranslations("Admin");
  // Casts : `field.key` vient de la config serveur, donc la clé se construit à
  // l'exécution et échappe au catalogue typé (cf. lib/i18n-keys.ts).
  const label = t(`fields.${field.key}.label` as AdminKey);
  // Description optionnelle : un champ dont le libellé se suffit n'en a pas.
  const descKey = `fields.${field.key}.desc` as AdminKey;
  const desc = t.has(descKey) ? t(descKey) : null;

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-full max-w-md" />
      </div>
    );
  }

  return field.kind === "flag" ? (
    <FlagRow field={field} label={label} desc={desc} value={value} onSaved={onSaved} />
  ) : (
    <ModelRow field={field} label={label} desc={desc} value={value} onSaved={onSaved} />
  );
}

/**
 * Un réglage de modèle. Le contrôle est le picker de l'app (`ModelCombobox`,
 * portée `platform`) : on choisit une MARQUE et un NOM — l'id OpenRouter ne
 * s'affiche nulle part, c'est un détail de transport.
 *
 * Le catalogue vient de la clé plateforme, pas du BYOK de l'admin qui regarde :
 * ces modèles-là tournent sur la plateforme, un id Anthropic écrit ici serait
 * cassé au runtime. La saisie libre reste offerte (un modèle tout juste sorti
 * peut manquer au catalogue), et « modèle par défaut » efface le réglage — il
 * suit alors le défaut produit au lieu d'être figé sur sa valeur du jour.
 *
 * Plus de bouton « Enregistrer » : un choix dans une liste est un acte unique,
 * il s'enregistre à la sélection (comme l'interrupteur de `FlagRow`).
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
  onSaved: (key: string, value: string) => void;
}) {
  const t = useTranslations("Admin");
  // Les libellés du picker vivent dans le namespace Agent : c'est le MÊME
  // composant que celui de l'agent, tous ses points d'usage les partagent.
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
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {desc ? <p className="text-xs text-muted-foreground">{desc}</p> : null}
      <div className="mt-1 flex max-w-md items-center gap-2">
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
    </div>
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
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <label htmlFor={`cfg-${field.key}`} className="text-sm font-medium">
          {label}
        </label>
        {desc ? <p className="text-xs text-muted-foreground">{desc}</p> : null}
      </div>
      <Switch
        id={`cfg-${field.key}`}
        checked={checked}
        onCheckedChange={(v) => void toggle(v)}
      />
    </div>
  );
}
