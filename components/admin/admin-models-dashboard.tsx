"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
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
import { ModelCombobox } from "@/components/agent/model-combobox";
import { formatModelName } from "@/lib/model-display";
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
      byok: [],
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
        /* C'est littéralement un écran de réglages : un groupe par famille, un
           champ par rangée. Même grammaire que /settings (MIN-167). */
        <div className="flex flex-col gap-4">
          {AI_MODEL_CONFIG_GROUPS.map((group) => (
            <SettingsGroup
              key={group}
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
        </div>
      )}
    </div>
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
  /** Suffixe de routage OpenRouter du champ, quand il en accepte un (MIN-263). */
  suffix: string | null;
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
 *
 * À droite, le raccourci de routage OpenRouter (MIN-263) : il ne change PAS de
 * modèle, il ordonne les providers de celui-là. D'où la seconde liste plutôt
 * qu'un id à rallonge dans la première — et « Aucun » par défaut.
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
    <SettingsRow
      label={label}
      hint={desc ?? undefined}
      control={
        <>
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
          {isSuffixableField(field) ? (
            <SuffixSelect field={field} value={suffix} onSaved={onSaved} />
          ) : null}
          {busy ? <Spinner className="shrink-0" /> : null}
        </>
      }
    />
  );
}

/** Valeur du `Select` pour « aucun raccourci » (un item ne peut être vide). */
const NO_SUFFIX = "__none__";

/** Libellés des raccourcis — table typée, pas de clé assemblée à l'exécution. */
const SUFFIX_LABEL_KEYS: Record<ModelSuffix, AdminKey> = {
  nitro: "suffix.nitro",
  floor: "suffix.floor",
  exacto: "suffix.exacto",
};

/**
 * Le raccourci de routage OpenRouter d'un modèle (`:nitro`, `:floor`,
 * `:exacto`). Il s'enregistre sur sa PROPRE clé `app_config` — jamais dans l'id
 * du modèle — pour que le catalogue, l'affichage et le prix continuent de voir
 * un id nu, et pour que le retirer ne touche pas au modèle choisi.
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
      <SelectTrigger className="w-36 shrink-0" aria-label={t("suffix.label")}>
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
 * Un id de modèle SAISI, pas choisi : les défauts frontier des providers BYOK
 * vivent dans le namespace du provider (`claude-sonnet-5`, pas
 * `anthropic/claude-sonnet-5`), donc le picker plateforme — qui liste des ids
 * OpenRouter — y écrirait des valeurs cassées au runtime. Le placeholder montre
 * le défaut produit ; vider le champ y revient.
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

/** Valeur du `Select` pour « pas de niveau conseillé » (un item ne peut être vide). */
const INHERIT_EFFORT = "__inherit__";

/** Clés des libellés de niveau de réflexion — table typée, pas de clé assemblée. */
const EFFORT_LABEL_KEYS: Record<SubagentThinkingEffort, AdminKey> = {
  low: "favorites.effortLow",
  medium: "favorites.effortMedium",
  high: "favorites.effortHigh",
};

/**
 * La liste « Favorites for sub-agents » (MIN-112) : ce que l'agent parent lit dans
 * son prompt pour décider sur quoi lancer une fille.
 *
 * Deux choses la distinguent des autres lignes. D'abord elle s'enregistre EN LOT :
 * un favori n'est utile que complet (le modèle sans son conseil d'usage ne dit rien),
 * donc bouton « Enregistrer » plutôt qu'un enregistrement au choix. Ensuite le
 * `use_case` est du PROMPT, pas de l'UI : il part tel quel dans le prompt système du
 * parent — écrit en anglais, et adressé à un modèle qui choisit, pas à un humain qui
 * lit. « Réinitialiser » efface la ligne `app_config` : le réglage suit de nouveau le
 * défaut produit au lieu d'être figé sur sa valeur du jour.
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
  // Le MÊME parseur que le runtime : ce que l'écran montre est ce que l'agent lira.
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

  // Liste vidée = retour au repli produit : on efface la ligne plutôt que
  // d'enregistrer un tableau vide, que le runtime remplacerait de toute façon.
  const save = () => void write(list.length > 0 ? JSON.stringify(list) : "");

  return (
    /* La seule rangée verticale du tableau de bord : une LISTE de favoris, avec
       son propre texte long — elle ne tient pas au bout d'une ligne. */
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
