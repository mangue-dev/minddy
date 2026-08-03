"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from "mangue-ui";
import { FolderKanban, Workflow } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import {
  SettingsEmpty,
  SettingsGroup,
  SettingsListRow,
  SettingsRow,
} from "@/components/settings/settings-ui";
import { AutomationPresetPicker } from "@/components/automations/automation-preset-picker";
import { ProjectOrb } from "@/components/project-orb";
import { ModelCombobox } from "@/components/agent/model-combobox";
import {
  AUTOMATION_EFFORTS_META_KEY,
  AUTOMATION_START_DELAY_CHOICES,
  AUTOMATION_START_DELAY_META_KEY,
  AUTOMATION_MODELS_META_KEY,
  AUTOMATION_PRESET_META_KEY,
  presetRules,
  resolveAutomationEfforts,
  resolveAutomationModels,
  resolveAutomationPreset,
  resolveAutomationStartDelayMinutes,
  stepCostUsd,
  simulateIssueLifetime,
  simulatedRunModes,
  type AutomationPresetId,
} from "@/lib/automations";
import { useBillingSummary } from "@/lib/use-billing-query";
import { EFFORTS, type IssueEffort } from "@/lib/issue-constants";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * Compte → Automatisations (MIN-147). Le préréglage vit ICI, pas sur chaque
 * projet : on ne reconfigure pas la même boucle à chaque nouveau dépôt.
 *
 * Ce qui reste au projet, c'est l'INTERRUPTEUR — un par projet, listés plus bas.
 * Armer la boucle sur un dépôt de production n'est pas la même décision que sur
 * un bac à sable, et c'est la seule décision qui mérite d'être reprise projet
 * par projet.
 *
 * Seuls les projets dont on est PROPRIÉTAIRE apparaissent : c'est le propriétaire
 * qui paie (`billTo: projectOwner`), lui seul qui peut armer un projet, et c'est
 * son préréglage que le moteur lit. Payeur et configurateur sont la même
 * personne — ce qui est exactement ce qu'un réglage de compte devait garantir.
 *
 * Écritures : le préréglage par `updateUserMetadata` (patron des préférences de
 * compte), l'interrupteur par `updateProject` (la liste blanche du PATCH projet,
 * déjà gatée par `canUseAutomations`).
 */

const PRESET_DESC_KEYS: Record<
  AutomationPresetId,
  MessageKey<"Automations">
> = {
  "loop-by-effort": "presetLoopByEffortDesc",
  "plan-and-verify": "presetPlanAndVerifyDesc",
  "plan-only": "presetPlanOnlyDesc",
  "implement-only": "presetImplementOnlyDesc",
  "verify-only": "presetVerifyOnlyDesc",
};

/**
 * Le ticket-type de chaque effort, tel que les règles le verront à l'entrée en
 * « à faire » : ni plan, ni assigné, ni catégorie. C'est le cas NOMINAL — celui
 * qui dit la promesse.
 */
function sampleIssue(effort: IssueEffort) {
  return {
    status: "todo" as const,
    effort,
    priority: "none" as const,
    plan: null,
    assigneeId: null,
    categoryIds: [] as string[],
  };
}

export function AccountAutomationsSection() {
  const t = useTranslations("Automations");
  const tAgent = useTranslations("Agent");
  const { user, updateUserMetadata } = useAuth();
  const { projects, updateProject } = useProjects();
  const { includedUsd } = useBillingSummary();

  const [preset, setPreset] = useState<AutomationPresetId | null>(
    resolveAutomationPreset(user?.user_metadata),
  );
  const [savingPreset, setSavingPreset] = useState(false);
  useEffect(() => {
    setPreset(resolveAutomationPreset(user?.user_metadata));
  }, [user]);

  const [efforts, setEfforts] = useState(
    resolveAutomationEfforts(user?.user_metadata),
  );
  const [models, setModels] = useState(
    resolveAutomationModels(user?.user_metadata),
  );
  useEffect(() => {
    setEfforts(resolveAutomationEfforts(user?.user_metadata));
    setModels(resolveAutomationModels(user?.user_metadata));
  }, [user]);

  const [delay, setDelay] = useState(() =>
    resolveAutomationStartDelayMinutes(user?.user_metadata),
  );
  useEffect(() => {
    setDelay(resolveAutomationStartDelayMinutes(user?.user_metadata));
  }, [user]);

  const setStartDelay = async (minutes: number) => {
    const prev = delay;
    setDelay(minutes); // optimiste — annulé en cas d'échec
    try {
      await updateUserMetadata({ [AUTOMATION_START_DELAY_META_KEY]: minutes });
    } catch (e) {
      setDelay(prev);
      toast.error((e as Error).message);
    }
  };

  // Un projet en cours d'écriture : son interrupteur seul se fige, pas la liste.
  const [pending, setPending] = useState<string | null>(null);

  /** Tailles ÉTEINTES — le compteur de l'accordéon replié. */
  const offCount = EFFORTS.filter((e) => !efforts[e.value]).length;

  const setEffortEnabled = async (effort: IssueEffort, enabled: boolean) => {
    const next = { ...efforts, [effort]: enabled };
    setEfforts(next); // optimiste — annulé en cas d'échec
    try {
      await updateUserMetadata({ [AUTOMATION_EFFORTS_META_KEY]: next });
    } catch (e) {
      setEfforts(efforts);
      toast.error((e as Error).message);
    }
  };

  const setEffortModel = async (effort: IssueEffort, model: string) => {
    // Vide = « mon modèle par défaut » : on retire la clé plutôt que d'écrire
    // une chaîne vide, pour que le repli reste le défaut du compte.
    const next = { ...models };
    if (model.trim()) next[effort] = model.trim();
    else delete next[effort];
    setModels(next);
    try {
      await updateUserMetadata({ [AUTOMATION_MODELS_META_KEY]: next });
    } catch (e) {
      setModels(models);
      toast.error((e as Error).message);
    }
  };

  const owned = projects.filter((p) => p.owner_id === user?.id);

  const choosePreset = async (next: AutomationPresetId | null) => {
    if (savingPreset) return;
    const prev = preset;
    setPreset(next); // optimiste — annulé en cas d'échec
    setSavingPreset(true);
    try {
      await updateUserMetadata({ [AUTOMATION_PRESET_META_KEY]: next });
    } catch (e) {
      setPreset(prev);
      toast.error((e as Error).message);
    } finally {
      setSavingPreset(false);
    }
  };

  const toggleProject = async (
    projectId: string,
    next: boolean,
    name: string,
  ) => {
    setPending(projectId);
    try {
      await updateProject(projectId, { automations_enabled: next });
      toast.success(t(next ? "enabledToast" : "disabledToast", { name }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(null);
    }
  };

  // Ce que ça coûte, par taille de ticket — sur la VIE du ticket, toutes chaînes
  // confondues. Toujours en part du budget mensuel, jamais en dollars.
  const rules = preset ? presetRules(preset) : [];
  const costRows = EFFORTS.map((e) => {
    // Une taille éteinte ne coûte RIEN : le tableau doit le dire, sinon les deux
    // réglages se contrediraient à l'écran.
    const modes = efforts[e.value]
      ? simulatedRunModes(simulateIssueLifetime(rules, sampleIssue(e.value)))
      : [];
    // Deux dimensions : ce que l'étape fait, et la TAILLE du ticket. Planifier
    // un XS et planifier un XL ne coûtent pas la même chose.
    const usd = modes.reduce(
      (sum, mode) => sum + stepCostUsd(mode, e.value),
      0,
    );
    const share = includedUsd > 0 ? (usd / includedUsd) * 100 : 0;
    return { effort: e.label, steps: modes.length, share };
  });

  return (
    <>
      <SettingsGroup
        icon={Workflow}
        title={t("title")}
        description={t("description")}
        help={t("presetHint")}
      >
        {/* 1. Quel préréglage ? Sa description est VISIBLE : c'est la seule
            chose qu'on lit avant d'armer une boucle qui dépense. Le sélecteur
            est une grille de cartes, donc une rangée verticale — l'exception
            assumée au clé/valeur. */}
        <SettingsRow label={t("presetTitle")} orientation="vertical">
          <AutomationPresetPicker
            value={preset}
            onChange={(next) => void choosePreset(next)}
            disabled={savingPreset}
          />
          <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
            {preset ? t(PRESET_DESC_KEYS[preset]) : t("presetNoneSelected")}
          </p>
        </SettingsRow>

        {/* 2. Combien ça coûte ? Cinq lignes courtes. */}
        {preset && (
          <SettingsRow
            label={t("costTitle")}
            orientation="vertical"
            help={
              <>
                {t("costDesc")}
                <br />
                <br />
                {t("costFallback")}
              </>
            }
          >
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground tabular-nums">
              {costRows.map((row) => (
                <li key={row.effort}>
                  {row.steps === 0
                    ? t("costNoSteps", { effort: row.effort })
                    : row.share > 0 && row.share < 1
                      ? t("costRowUnder", {
                          effort: row.effort,
                          steps: row.steps,
                        })
                      : t("costRow", {
                          effort: row.effort,
                          steps: row.steps,
                          share: `${Math.round(row.share)} %`,
                        })}
                </li>
              ))}
            </ul>
          </SettingsRow>
        )}

        {/* 3. Le SURSIS. Juste après le coût, parce que c'est le garde-fou qui
            protège ce coût-là : le temps de se raviser avant que ça dépense. */}
        {preset && (
          <SettingsRow
            htmlFor="automation-delay"
            label={t("delayTitle")}
            help={t("delayHint")}
            control={
              <Select
                value={String(delay)}
                onValueChange={(v) => void setStartDelay(Number(v))}
              >
                <SelectTrigger id="automation-delay" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTOMATION_START_DELAY_CHOICES.map((min) => (
                    <SelectItem key={min} value={String(min)}>
                      {min === 0 ? t("delayImmediate") : t("delayMinutes", { minutes: min })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        )}

        {/* 4. La personnalisation, PLIÉE. Le préréglage marche tel quel : ces
            deux réglages sont pour qui veut aller plus loin, et n'ont donc pas à
            occuper l'écran de qui vient juste d'en choisir un. */}
        {preset && (
          <Accordion type="multiple">
            <AccordionItem value="efforts" className="border-b-0">
              <AccordionTrigger className="py-3 text-sm font-medium">
                <span className="flex items-center gap-2">
                  {t("effortsTitle")}
                  {offCount > 0 && (
                    <Badge variant="secondary">
                      {EFFORTS.length - offCount}/{EFFORTS.length}
                    </Badge>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <p className="pb-1 text-xs leading-relaxed text-muted-foreground">
                  {t("effortsHint")}
                </p>
                <div className="divide-y divide-border">
                  {EFFORTS.map((e) => (
                    <SettingsRow
                      key={e.value}
                      className="py-2.5"
                      label={<span className="tabular-nums">{e.label}</span>}
                      control={
                        <Switch
                          checked={efforts[e.value]}
                          onCheckedChange={(v) =>
                            void setEffortEnabled(e.value, v)
                          }
                          aria-label={t("effortEnabled", { effort: e.label })}
                        />
                      }
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="models" className="border-b-0">
              <AccordionTrigger className="py-3 text-sm font-medium">
                {t("modelsTitle")}
              </AccordionTrigger>
              <AccordionContent>
                <p className="pb-1 text-xs leading-relaxed text-muted-foreground">
                  {t("modelsHint")}
                </p>
                <div className="divide-y divide-border">
                  {EFFORTS.map((e) => (
                    <SettingsRow
                      key={e.value}
                      className="py-2.5"
                      label={<span className="tabular-nums">{e.label}</span>}
                      control={
                        <ModelCombobox
                          variant="compact"
                          value={models[e.value] ?? ""}
                          onChange={(v) => void setEffortModel(e.value, v)}
                          defaultLabel={t("modelDefault")}
                          placeholder={tAgent("modelSearchPlaceholder")}
                          emptyLabel={tAgent("modelSearchEmpty")}
                          loadingLabel={tAgent("modelSearchLoading")}
                          freeTextLabel={(q) =>
                            tAgent("modelUseCustom", { model: q })
                          }
                          // Une taille éteinte ne lance rien : lui choisir un
                          // modèle n'aurait aucun effet, et l'offrir quand même
                          // laisserait croire le contraire.
                          disabled={!efforts[e.value]}
                        />
                      }
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </SettingsGroup>

      {/* 5. Sur quels projets ? Un interrupteur par projet possédé — c'est ce
          qui remplace l'ancien toggle général des réglages de projet. */}
      <SettingsGroup
        icon={FolderKanban}
        title={t("projectsTitle")}
        description={t("projectsHint")}
      >
        {owned.length === 0 ? (
          <SettingsEmpty>{t("projectsEmpty")}</SettingsEmpty>
        ) : (
          owned.map((project) => (
            /* L'icône avant le nom : c'est à elle qu'on reconnaît un projet
               partout ailleurs (barre latérale, fil d'Ariane, cartes) — une
               liste d'interrupteurs se lit plus vite quand elle parle le même
               langage. */
            <SettingsListRow
              key={project.id}
              avatar={
                <ProjectOrb
                  seed={project.id}
                  iconUrl={project.icon_url}
                  className="size-6 shrink-0"
                />
              }
              title={project.name}
              action={
                <Switch
                  checked={project.automations_enabled === true}
                  onCheckedChange={(v) =>
                    void toggleProject(project.id, v, project.name)
                  }
                  disabled={pending === project.id}
                  aria-label={t("projectEnabled", { name: project.name })}
                />
              }
            />
          ))
        )}
      </SettingsGroup>
    </>
  );
}
