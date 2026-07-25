"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Input,
  Separator,
  Skeleton,
  Spinner,
  Switch,
  toast,
} from "mangue-ui";
import { SettingsSection } from "@/components/settings-shell";
import {
  AI_MODEL_CONFIG_FIELDS,
  AI_MODEL_CONFIG_GROUPS,
  type AiConfigField,
  type AiConfigGroup,
} from "@/lib/ai-model-config";

type ConfigValues = Record<string, string | null>;

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
    <div className="mx-auto max-w-[880px] space-y-8 p-4 md:p-8">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
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
                  t.has(`groups.${group}.desc`)
                    ? t(`groups.${group}.desc`)
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
  const label = t(`fields.${field.key}.label`);
  // Description optionnelle : un champ dont le libellé se suffit n'en a pas.
  const descKey = `fields.${field.key}.desc`;
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
  const tCommon = useTranslations("Common");
  const saved = value ?? "";
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);

  // Re-sync when the loaded value arrives / changes underneath us.
  useEffect(() => setDraft(saved), [saved]);

  const dirty = draft.trim() !== saved.trim();

  const save = async () => {
    const next = draft.trim();
    if (!next || !dirty || busy) return;
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
      <label htmlFor={`cfg-${field.key}`} className="text-sm font-medium">
        {label}
      </label>
      {desc ? <p className="text-xs text-muted-foreground">{desc}</p> : null}
      <div className="mt-1 flex items-center gap-2">
        <Input
          id={`cfg-${field.key}`}
          value={draft}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder={field.fallback}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
          className="max-w-md font-mono text-[13px]"
        />
        <Button
          type="button"
          onClick={() => void save()}
          disabled={busy || !dirty || !draft.trim()}
        >
          {busy && <Spinner />}
          {tCommon("save")}
        </Button>
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
