"use client";

import { useTranslations } from "next-intl";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "mangue-ui";
import { Trash2 } from "lucide-react";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { ReasoningCombobox } from "@/components/agent/reasoning-combobox";
import { StatusIndicator } from "@/components/issue-indicators";
import { ALL_STATUSES, EFFORTS, type IssueStatus } from "@/lib/issue-constants";
import { DEFAULT_REASONING_LEVEL, type ReasoningLevel } from "@/lib/agent-reasoning";
import {
  AUTOMATION_RUN_MODES,
  type AutomationRule,
  type AutomationRunAction,
} from "@/lib/automations";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * L'éditeur d'UNE règle : `quand … si … alors …`, sur une ligne qui se lit comme
 * une phrase. Rien n'est inventé ici pour le choix du modèle et du niveau de
 * raisonnement — ce sont les deux pickers du composer de lancement, qui font
 * déjà le catalogue OpenRouter, le grisage hors plan et le repli BYOK.
 *
 * Le levier de coût par étape vit ICI : un XL se planifie avec un gros modèle, un
 * diff de trois lignes se relit avec un petit. C'est le seul endroit du produit
 * où ces deux choix se prennent AVANT le lancement, pour tous les lancements à
 * venir.
 */

const MODE_KEYS: Record<(typeof AUTOMATION_RUN_MODES)[number], MessageKey<"Automations">> = {
  plan: "modePlan",
  implement: "modeImplement",
  verify: "modeVerify",
  custom: "modeCustom",
};

/**
 * Nom AFFICHÉ des règles des préréglages. Le `name` stocké en base est celui
 * qu'avait la langue du serveur au moment où le préréglage a été appliqué — le
 * garder tel quel ferait lire des règles françaises à un écran anglais. Les
 * règles ÉCRITES à la main, elles, gardent leur nom : c'est celui de la personne
 * qui les a écrites, pas une chaîne du produit.
 */
const PRESET_RULE_NAME_KEYS: Record<string, MessageKey<"Automations">> = {
  "loop-by-effort:small-implement": "ruleSmallImplement",
  "loop-by-effort:medium-plan": "ruleMediumPlan",
  "loop-by-effort:medium-implement": "ruleMediumImplement",
  "loop-by-effort:medium-verify": "ruleMediumVerify",
  "loop-by-effort:big-plan": "ruleBigPlan",
  "loop-by-effort:big-review-plan": "ruleBigReviewPlan",
  "loop-by-effort:big-await-human": "ruleBigAwaitHuman",
  "loop-by-effort:big-implement": "ruleBigImplement",
  "loop-by-effort:big-verify": "ruleBigVerify",
  "plan-only:write": "rulePlanOnlyWrite",
  "verify-only:verify": "ruleVerifyOnlyVerify",
};

/** Le premier `run_numo` de la règle, s'il y en a un — celui qu'on règle. */
function runActionOf(rule: AutomationRule): AutomationRunAction | null {
  const action = rule.then[0];
  return action?.type === "run_numo" ? action : null;
}

export function AutomationRuleRow({
  rule,
  onChange,
  onRemove,
  disabled,
}: {
  rule: AutomationRule;
  onChange: (next: AutomationRule) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Automations");
  const tStatus = useTranslations("Status");
  const tAgent = useTranslations("Agent");
  const run = runActionOf(rule);

  const patchRun = (patch: Partial<AutomationRunAction>) => {
    if (!run) return;
    onChange({ ...rule, then: [{ ...run, ...patch }, ...rule.then.slice(1)] });
  };

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {PRESET_RULE_NAME_KEYS[rule.id]
              ? t(PRESET_RULE_NAME_KEYS[rule.id])
              : rule.name}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {/* La phrase de la règle, en clair. Ce que le moteur lit, dit avec
                les mots de l'écran — pas un résumé approximatif. */}
            <span>{t("when")} </span>
            {rule.when.type === "status_changed" ? (
              <>
                <span>{t("whenStatusChanged")} </span>
                <span className="text-foreground">
                  {rule.when.to
                    .map((s) => tStatus(s as MessageKey<"Status">))
                    .join(", ")}
                </span>
              </>
            ) : (
              <span>{t("whenRunFinished")}</span>
            )}
            <span> · {t("ifLabel")} </span>
            <span className="text-foreground">
              {rule.if.effort?.length
                ? `${t("ifEffort")} ${rule.if.effort
                    // `none` n'est pas un sigle : c'est « effort non renseigné »,
                    // et le passer en capitales le faisait lire comme une taille
                    // de plus, entre le M et le L.
                    .map((e) => (e === "none" ? t("effortNone") : e.toUpperCase()))
                    .join(", ")}`
                : t("ifAny")}
            </span>
            <span> · {t("then")} </span>
            <span className="text-foreground">
              {run
                ? `${t("actionRunNumo")} — ${t(MODE_KEYS[run.mode])}`
                : rule.then[0]?.type === "set_status"
                  ? `${t("actionSetStatus")} ${tStatus(
                      (rule.then[0] as { status: IssueStatus }).status as MessageKey<"Status">,
                    )}`
                  : rule.then[0]?.type === "await_human"
                    ? t("actionAwaitHuman")
                    : t("actionStop")}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Switch
            checked={rule.enabled}
            onCheckedChange={(v) => onChange({ ...rule, enabled: v })}
            disabled={disabled}
            aria-label={t("ruleEnabled")}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={disabled}
            aria-label={t("removeRule")}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      {/* Le réglage par étape : modèle et raisonnement. Absent quand la règle ne
          lance pas Numo — poser un statut ne coûte pas de tokens. */}
      {run && rule.enabled && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("modelLabel")}</span>
          <div className="min-w-52">
            <ModelCombobox
              value={run.model ?? ""}
              onChange={(v) => patchRun({ model: v || null })}
              defaultLabel={t("modelDefault")}
              placeholder={tAgent("modelSearchPlaceholder")}
              emptyLabel={tAgent("modelSearchEmpty")}
              loadingLabel={tAgent("modelSearchLoading")}
              freeTextLabel={(q) => tAgent("modelUseCustom", { model: q })}
              disabled={disabled}
              variant="compact"
            />
          </div>
          <span className="text-xs text-muted-foreground">{t("reasoningLabel")}</span>
          <ReasoningCombobox
            value={run.reasoningLevel ?? DEFAULT_REASONING_LEVEL}
            onChange={(v: ReasoningLevel) => patchRun({ reasoningLevel: v })}
            disabled={disabled}
          />
        </div>
      )}
    </li>
  );
}

/** Statuts offerts par l'éditeur, dans l'ordre des pickers du produit. */
export const AUTOMATION_STATUS_OPTIONS = ALL_STATUSES.map((s) => s.value);
/** Efforts offerts, plus « non renseigné » — la valeur qui traite le ticket
    qu'on n'a pas chiffré. */
export const AUTOMATION_EFFORT_OPTIONS = [...EFFORTS.map((e) => e.value), "none" as const];

/**
 * Le sélecteur de statut d'une règle, extrait pour l'écran de réglages : il sert
 * au déclencheur `status_changed` comme à l'action `set_status`, et un statut se
 * choisit avec son glyphe, jamais avec son seul nom.
 */
export function AutomationStatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: IssueStatus;
  onChange: (value: IssueStatus) => void;
  disabled?: boolean;
}) {
  const tStatus = useTranslations("Status");
  return (
    <Select value={value} onValueChange={(v) => onChange(v as IssueStatus)} disabled={disabled}>
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {AUTOMATION_STATUS_OPTIONS.map((status) => (
          <SelectItem key={status} value={status}>
            <span className="flex items-center gap-2">
              <StatusIndicator status={status} />
              {tStatus(status as MessageKey<"Status">)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
