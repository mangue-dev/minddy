"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Switch,
  toast,
} from "mangue-ui";
import { ChevronRight } from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { SettingsSection } from "@/components/settings-shell";
import { HelpHint } from "@/components/settings/help-hint";
import { AutomationRuleRow } from "@/components/automations/automation-rule-row";
import {
  AUTOMATION_PRESET_IDS,
  DEFAULT_STEP_COST_USD,
  parseAutomations,
  presetOfRules,
  presetRules,
  simulateChain,
  simulatedRunModes,
  type AutomationPresetId,
  type AutomationRule,
} from "@/lib/automations";
import { useBillingSummary } from "@/lib/use-billing-query";
import { EFFORTS, type IssueEffort } from "@/lib/issue-constants";
import type { MessageKey } from "@/lib/i18n-keys";
import type { Project } from "@/lib/types";

/**
 * Les automatisations d'un projet (MIN-147).
 *
 * L'écran répond à trois questions, dans cet ordre : est-ce allumé, quel jeu de
 * règles, combien ça coûte. Les règles elles-mêmes sont PLIÉES — neuf lignes
 * `quand/si/alors` sous les yeux de quelqu'un qui vient juste activer la
 * fonctionnalité, c'est du bruit ; qui veut les régler les déplie.
 *
 * Toute la prose est passée derrière des ⓘ (`HelpHint`). Un écran de réglages se
 * lit d'un coup d'œil : ce qui est allumé, ce qui est choisi, ce que ça coûte.
 * Les explications ont leur place, à un clic — pas entre deux interrupteurs, où
 * elles noient l'organisation de la page.
 *
 * Propriétaire seul, comme Smart Assign : c'est son budget qui paye, et
 * l'écriture passe par `updateProject` (la même liste blanche que le PATCH du
 * projet), donc le realtime rafraîchit la section tout seul.
 */

const PRESET_LABEL_KEYS: Record<AutomationPresetId, MessageKey<"Automations">> = {
  "loop-by-effort": "presetLoopByEffort",
  "plan-only": "presetPlanOnly",
  "verify-only": "presetVerifyOnly",
};

const PRESET_DESC_KEYS: Record<AutomationPresetId, MessageKey<"Automations">> = {
  "loop-by-effort": "presetLoopByEffortDesc",
  "plan-only": "presetPlanOnlyDesc",
  "verify-only": "presetVerifyOnlyDesc",
};

/** Valeur du sélecteur quand les règles ne viennent (plus) d'un préréglage. */
const CUSTOM = "__custom__";
const NONE = "__none__";

/**
 * Le ticket-type de chaque effort, tel que les règles le verront à l'entrée en
 * « à faire ». Pas de plan, pas d'assigné, pas de catégorie : c'est le cas
 * NOMINAL, celui qui dit la promesse — un ticket qui a déjà un plan suit un
 * chemin plus court, et le montrer ici mélangerait deux questions.
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

export function ProjectAutomationsSection({
  project,
  isOwner,
}: {
  project: Project;
  isOwner: boolean;
}) {
  const t = useTranslations("Automations");
  const tc = useTranslations("Common");
  const { updateProject } = useProjects();
  const { includedUsd } = useBillingSummary();

  const saved = useMemo(() => parseAutomations(project.automations), [project.automations]);

  // Interrupteur en miroir local : il bascule tout de suite, puis se réconcilie
  // depuis le projet (realtime / refetch) — le patron de Smart Assign.
  const [enabled, setEnabled] = useState(project.automations_enabled === true);
  const [savingToggle, setSavingToggle] = useState(false);
  useEffect(() => {
    setEnabled(project.automations_enabled === true);
  }, [project.automations_enabled]);

  const [rules, setRules] = useState<AutomationRule[]>(saved);
  const [savingRules, setSavingRules] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  useEffect(() => setRules(saved), [saved]);

  const dirty = JSON.stringify(rules) !== JSON.stringify(saved);
  const activePreset = presetOfRules(rules);
  const selectValue = activePreset ?? (rules.length === 0 ? NONE : CUSTOM);

  const toggle = async (next: boolean) => {
    if (!isOwner || savingToggle) return;
    setEnabled(next); // optimiste — annulé plus bas en cas d'échec
    setSavingToggle(true);
    try {
      await updateProject(project.id, { automations_enabled: next });
      toast.success(t(next ? "enabledToast" : "disabledToast"));
    } catch (e) {
      setEnabled(!next);
      toast.error((e as Error).message);
    } finally {
      setSavingToggle(false);
    }
  };

  const saveRules = async (next: AutomationRule[]) => {
    setSavingRules(true);
    try {
      await updateProject(project.id, { automations: next });
      toast.success(t("rulesSaved"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingRules(false);
    }
  };

  // Ce que ça coûte, par taille de ticket. L'estimation fine (médiane de
  // l'historique du projet) vit côté serveur, sur la route de la chaîne ; ici on
  // montre l'ordre de grandeur des DÉFAUTS, qui suffit à répondre à la seule
  // question qu'on se pose devant cet écran : « est-ce que ça va me coûter cher ? »
  const costRows = EFFORTS.map((e) => {
    const modes = simulatedRunModes(
      simulateChain(rules, sampleIssue(e.value), { throughHumanStop: true }),
    );
    const usd = modes.reduce((sum, mode) => sum + DEFAULT_STEP_COST_USD[mode], 0);
    const share = includedUsd > 0 ? (usd / includedUsd) * 100 : 0;
    return { effort: e.label, steps: modes.length, share };
  });

  return (
    <SettingsSection title={t("title")}>
      <div className="flex flex-col gap-5">
        {/* 1. C'est allumé ? */}
        <div className="flex items-center gap-2">
          <Switch
            id="automations-enabled"
            checked={enabled}
            onCheckedChange={(v) => void toggle(v)}
            disabled={savingToggle || !isOwner}
          />
          <label
            htmlFor="automations-enabled"
            className="cursor-pointer text-sm text-foreground"
          >
            {t("toggleLabel")}
          </label>
          <HelpHint>
            {t("description")}
            <br />
            <br />
            {isOwner ? t("toggleHint") : t("ownerOnlyHint")}
          </HelpHint>
        </div>

        {/* 2. Quel jeu de règles ? Une ligne, et l'explication du choix courant
            derrière le ⓘ — les trois cartes descriptives disaient la même chose
            en quinze lignes. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("presetTitle")}</span>
          <Select
            value={selectValue}
            onValueChange={(value) => {
              if (value === CUSTOM || value === NONE) return;
              const next = presetRules(value as AutomationPresetId);
              setRules(next);
              void saveRules(next);
            }}
            disabled={!isOwner || savingRules}
          >
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTOMATION_PRESET_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {t(PRESET_LABEL_KEYS[id])}
                </SelectItem>
              ))}
              {/* Deux états qu'on ne CHOISIT pas : ils décrivent où on en est. */}
              {selectValue === CUSTOM && (
                <SelectItem value={CUSTOM} disabled>
                  {t("presetCustom")}
                </SelectItem>
              )}
              {selectValue === NONE && (
                <SelectItem value={NONE} disabled>
                  {t("presetNone")}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <HelpHint>
            {activePreset ? t(PRESET_DESC_KEYS[activePreset]) : t("presetCustomHint")}
            <br />
            <br />
            {t("presetDesc")}
          </HelpHint>
        </div>

        {/* 3. Combien ça coûte ? Cinq lignes courtes, jamais de dollars. */}
        {rules.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{t("costTitle")}</span>
              <HelpHint>
                {t("costDesc")}
                <br />
                <br />
                {t("costFallback")}
              </HelpHint>
            </div>
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground tabular-nums">
              {costRows.map((row) => (
                <li key={row.effort}>
                  {row.steps === 0
                    ? t("costNoSteps", { effort: row.effort })
                    : row.share > 0 && row.share < 1
                      ? t("costRowUnder", { effort: row.effort, steps: row.steps })
                      : t("costRow", {
                          effort: row.effort,
                          steps: row.steps,
                          share: `${Math.round(row.share)} %`,
                        })}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 4. Les règles — PLIÉES. Le préréglage livre déjà la valeur ; les
            déplier est le geste de qui veut régler le modèle d'une étape. */}
        <Collapsible open={rulesOpen} onOpenChange={setRulesOpen}>
          <div className="flex items-center gap-2">
            <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium outline-hidden focus-visible:underline">
              <ChevronRight
                className={`size-4 text-muted-foreground transition-transform ${
                  rulesOpen ? "rotate-90" : ""
                }`}
                aria-hidden
              />
              {t("rulesTitle")}
              <Badge variant="secondary">{rules.length}</Badge>
              {/* Plier peut CACHER une modification en attente : sans cette
                  marque, on quitterait l'écran en croyant avoir enregistré. */}
              {dirty && (
                <span
                  className="size-1.5 rounded-full bg-amber-500"
                  title={t("rulesUnsaved")}
                  aria-label={t("rulesUnsaved")}
                />
              )}
            </CollapsibleTrigger>
            <HelpHint>{t("rulesDesc")}</HelpHint>
          </div>
          <CollapsibleContent className="pt-2">
            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("rulesEmpty")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <ul className="flex flex-col gap-2">
                  {rules.map((rule, i) => (
                    <AutomationRuleRow
                      key={rule.id}
                      rule={rule}
                      disabled={!isOwner || savingRules}
                      onChange={(next) =>
                        setRules((rs) => rs.map((r, j) => (j === i ? next : r)))
                      }
                      onRemove={() => setRules((rs) => rs.filter((_, j) => j !== i))}
                    />
                  ))}
                </ul>
                {isOwner && (
                  <div>
                    <Button
                      type="button"
                      disabled={savingRules || !dirty}
                      onClick={() => void saveRules(rules)}
                    >
                      {savingRules && <Spinner />}
                      {tc("save")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </SettingsSection>
  );
}
