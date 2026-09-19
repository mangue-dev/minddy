"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn, SegmentedControl, toast } from "mangue-ui";
import { useProjects } from "@/lib/projects-context";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import {
  DEFAULT_SMART_TRIAGE_MODE,
  parseSmartTriageMode,
  SMART_TRIAGE_MODES,
  type SmartTriageMode,
} from "@/lib/smart-triage";
import type { Project } from "@/lib/types";

/**
 * Project-level Smart Triage preference (MIN-566, MIN-575): the per-project
 * ENGINE choice. `rules` reorders through the static rules (free); `jev`
 * replaces the ranking with an AI urgency score that bills the Automations
 * segment. There is no "off" — the triage is always available, the switch is
 * only about who ranks (MIN-575: a "disabled" state while the smart view sort
 * kept reordering by rules was a lie). The reorder itself is a BUTTON on the
 * board, never a background pass — this screen only decides what that button
 * does.
 *
 * Owner-only: members get the state read-only, like Smart Assign's switch.
 */
export function SmartTriageSection({
  project,
  isOwner,
}: {
  project: Project;
  isOwner: boolean;
}) {
  const t = useTranslations("Settings");
  const { updateProject } = useProjects();

  // Mirror the mode locally so it flips instantly, then reconcile from the
  // project (realtime / refetch) — the Smart Assign toggle's pattern. The
  // project value is NORMALIZED through the parser: a legacy `off` row (a
  // database the migration has not reached yet) must render as the default
  // (rules) — both a selected segment and the matching hint — never as a
  // selector with no choice and a hint that lies about the active engine.
  const [mode, setMode] = useState<SmartTriageMode>(
    parseSmartTriageMode(project.smart_triage_mode) ?? DEFAULT_SMART_TRIAGE_MODE
  );
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setMode(parseSmartTriageMode(project.smart_triage_mode) ?? DEFAULT_SMART_TRIAGE_MODE);
  }, [project.smart_triage_mode]);

  const change = async (next: SmartTriageMode) => {
    if (!isOwner || saving || next === mode) return;
    setMode(next); // optimistic — revert on failure below
    setSaving(true);
    try {
      await updateProject(project.id, { smart_triage_mode: next });
      toast.success(t("smartTriageSavedToast"));
    } catch (e) {
      setMode(parseSmartTriageMode(project.smart_triage_mode) ?? DEFAULT_SMART_TRIAGE_MODE);
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const modeOptions = SMART_TRIAGE_MODES.map((value) => ({
    value,
    label:
      value === "rules"
        ? t("smartTriageModeRules")
        : t("smartTriageModeJev"),
  }));
  const modeHint =
    mode === "rules"
      ? t("smartTriageModeRulesDesc")
      : t("smartTriageModeJevDesc");

  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.projectSmartTriage}
      title={t("smartTriageTab")}
      help={t("smartTriageDescription")}
    >
      <SettingsRow
        orientation="vertical"
        htmlFor="smart-triage-mode"
        label={t("smartTriageModeLabel")}
        hint={modeHint}
        control={
          // SegmentedControl has no disabled prop: a member gets the
          // pointer-events/opacity treatment, the same visual contract as a
          // disabled Switch.
          <div className={cn(!isOwner && "pointer-events-none opacity-60")}>
            <SegmentedControl
              options={modeOptions}
              value={mode}
              onChange={(value) => void change(value)}
              ariaLabel={t("smartTriageModeLabel")}
              className="w-72"
            />
          </div>
        }
      />
    </SettingsGroup>
  );
}
