"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { useAccountPreference } from "@/components/settings/use-account-preference";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { StatusIndicator } from "@/components/issue-indicators";
import { NUMO_DEFAULT_STATUS_OPTIONS, resolveNumoDefaultStatus } from "@/lib/numo-default-status";
import type { NumoDefaultStatus } from "@/lib/numo-default-status";
import { PROMPT_COPY_AUTO_START_META_KEY, resolvePromptCopyAutoStart } from "@/lib/prompt-copy-auto-start";
import { AUTO_ASSIGN_ON_START_META_KEY, resolveAutoAssignOnStart } from "@/lib/auto-assign-on-start";

const AUTO_ASSIGN_CREATED_META_KEY = "auto_assign_created";
const resolveAutoAssignCreated = (meta: Record<string, unknown> | null | undefined) =>
  meta?.[AUTO_ASSIGN_CREATED_META_KEY] === true;

/**
 * Account → Issues (MIN-737): what happens to an issue because of me — who it
 * is assigned to and what starting it does. These switches used to share one
 * nine-row card with Smart Fill and the Numo landing status.
 */
export function AccountIssuesSection() {
  const ta = useTranslations("Account");
  const [autoAssign, setAutoAssign, ready] = useAccountPreference(
    AUTO_ASSIGN_CREATED_META_KEY,
    resolveAutoAssignCreated,
  );
  const [autoAssignStart, setAutoAssignStart] = useAccountPreference(
    AUTO_ASSIGN_ON_START_META_KEY,
    resolveAutoAssignOnStart,
  );
  const [promptAutoStart, setPromptAutoStart] = useAccountPreference(
    PROMPT_COPY_AUTO_START_META_KEY,
    resolvePromptCopyAutoStart,
  );

  return (
    <>
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountIssues}
        title={ta("assignmentTitle")}
      >
        <SettingsRow
          htmlFor="account-auto-assign"
          label={ta("autoAssignLabel")}
          control={
            <Switch
              id="account-auto-assign"
              checked={autoAssign}
              onCheckedChange={(v) => void setAutoAssign(v)}
              disabled={!ready}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountStartingWork}
        title={ta("startingWorkTitle")}
      >
        <SettingsRow
          anchor={SETTINGS_SECTIONS.accountAutoAssignStart}
          htmlFor="account-auto-assign-start"
          label={ta("autoAssignStartLabel")}
          hint={ta("autoAssignStartDesc")}
          control={
            <Switch
              id="account-auto-assign-start"
              checked={autoAssignStart}
              onCheckedChange={(v) => void setAutoAssignStart(v)}
              disabled={!ready}
            />
          }
        />

        <SettingsRow
          anchor={SETTINGS_SECTIONS.accountPromptAutoStart}
          htmlFor="account-prompt-auto-start"
          label={ta("promptAutoStartLabel")}
          hint={ta("promptAutoStartDesc")}
          control={
            <Switch
              id="account-prompt-auto-start"
              checked={promptAutoStart}
              onCheckedChange={(v) => void setPromptAutoStart(v)}
              disabled={!ready}
            />
          }
        />
      </SettingsGroup>
    </>
  );
}

/** Account → AI & Numo: the status of the issues Numo creates for me. */
export function AccountNumoIssuesSection() {
  const ta = useTranslations("Account");
  const tStatus = useTranslations("Status");
  const [numoStatus, setNumoStatus, ready] = useAccountPreference<NumoDefaultStatus>(
    "numo_default_status",
    resolveNumoDefaultStatus,
  );

  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.accountNumoStatus}
      title={ta("numoIssuesTitle")}
    >
      <SettingsRow
        htmlFor="account-numo-status"
        label={ta("numoStatusTitle")}
        hint={ta("numoStatusDesc")}
        control={
          <Select
            value={numoStatus}
            onValueChange={(v) => void setNumoStatus(v as NumoDefaultStatus)}
            disabled={!ready}
          >
            <SelectTrigger id="account-numo-status" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NUMO_DEFAULT_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="flex items-center gap-2">
                    <StatusIndicator status={s} className="size-4" />
                    {tStatus(s)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
    </SettingsGroup>
  );
}
