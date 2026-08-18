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
  Skeleton,
  Switch,
  toast,
} from "mangue-ui";
import { FolderKanban, Workflow } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import {
  SettingsGroup,
  SettingsListRow,
  SettingsRow,
} from "@/components/settings/settings-ui";
import { EmptyScene } from "@/components/empty-scene";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { AutomationPresetPicker } from "@/components/automations/automation-preset-picker";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
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
 * Account → Automations (MIN-147). The preset lives HERE, not on each
 * project: we do not reconfigure the same loop for each new repository.
 *
 * What remains in the project is the SWITCH — one per project, listed below.
 * Arming the loop on a production repository is not the same decision as on
 * a sandbox, and it is the only decision that deserves to be taken up project
 * by project.
 *
 * Only the projects of which one is the OWNER appear: it is the owner
 * who pays (`billTo: projectOwner`), only he who can arm a project, and it's
 * its preset that the engine reads. Payer and configurator are the same person — which is exactly what an account setting should ensure. `updateProject` (the whitelist of the PATCH project,
 * already spoiled by `canUseAutomations`).
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
 * The standard ticket for each effort, as the rules will see it upon entry in
 * “to do”: neither plan, nor assigned, nor category. This is the NOMINAL case — the one
 * that says the promise.
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
  const { projects, updateProject, loading: projectsLoading } = useProjects();
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
    setDelay(minutes); // optimistic — canceled on failure
    try {
      await updateUserMetadata({ [AUTOMATION_START_DELAY_META_KEY]: minutes });
    } catch (e) {
      setDelay(prev);
      toast.error((e as Error).message);
    }
  };

  // A project being written: only its switch freezes, not the list.
  const [pending, setPending] = useState<string | null>(null);

  /** Sizes OFF — the folded accordion counter. */
  const offCount = EFFORTS.filter((e) => !efforts[e.value]).length;

  const setEffortEnabled = async (effort: IssueEffort, enabled: boolean) => {
    const next = { ...efforts, [effort]: enabled };
    setEfforts(next); // optimistic — canceled on failure
    try {
      await updateUserMetadata({ [AUTOMATION_EFFORTS_META_KEY]: next });
    } catch (e) {
      setEfforts(efforts);
      toast.error((e as Error).message);
    }
  };

  const setEffortModel = async (effort: IssueEffort, model: string) => {
    // Empty = “my default model”: we remove the key rather than writing
    // an empty string, so that the fallback remains the default of the account.
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
    setPreset(next); // optimistic — canceled on failure
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

  // What it costs, by ticket size — on the LIFE of the ticket, all channels
  // combined. Always based on the monthly budget, never dollars.
  const rules = preset ? presetRules(preset) : [];
  const costRows = EFFORTS.map((e) => {
    // An extinct size costs NOTHING: the table must say it, otherwise both
    // settings would contradict each other on screen.
    const modes = efforts[e.value]
      ? simulatedRunModes(simulateIssueLifetime(rules, sampleIssue(e.value)))
      : [];
    // Two dimensions: what the step does, and the SIZE of the ticket. To plan
    // an XS and planning an XL do not cost the same.
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
        anchor={SETTINGS_SECTIONS.accountAutomations}
        icon={Workflow}
        title={t("title")}
        description={t("description")}
        help={t("presetHint")}
      >
        {/* 1. What preset? Its description is VISIBLE: it is the only thing you read before arming a spending loop. The selector
 is a grid of cards, therefore a vertical row — the exception
 assumed to the key/value. */}
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

        {/* 2. How much does it cost? Five short lines. */}
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

        {/* 3. THE RESPONSIBILITY. Just after the cost, because it is the safeguard which
 protects this cost: the time to change your mind before it costs. */}
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

        {/* 4. Personalization, FOLDED. The preset works as is: these
 two settings are for those who want to go further, and therefore do not have to
 occupy the screen of those who have just chosen one. */}
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
                          // An off size doesn't do anything: choose one
                          // template would have no effect, and offer it anyway
                          // would suggest the opposite.
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

      {/* 5. On which projects? One switch per project owned — it's this
 which replaces the old general toggle for project settings. */}
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountAutomationsProjects}
        icon={FolderKanban}
        title={t("projectsTitle")}
        description={t("projectsHint")}
      >
        {projectsLoading ? (
          <div className="flex flex-col gap-2 py-3">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : owned.length === 0 ? (
          <EmptyScene
            size="compact"
            icon={FolderKanban}
            title={t("projectsEmpty")}
          />
        ) : (
          owned.map((project) => (
            /* The icon before the name: this is how we recognize a
 project everywhere else (sidebar, breadcrumbs, maps) — a
 list of switches is read faster when it speaks the same
 language. */
            <SettingsListRow
              key={project.id}
              avatar={
                <ProjectOrb
                  seed={projectOrbSeed(project)}
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
