"use client";

import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { useAccountPreference } from "@/components/settings/use-account-preference";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import {
  ISSUE_INDEXING_META_KEY,
  resolveIssueIndexing,
  resolveSmartFill,
  resolveSmartFillRelations,
  resolveSmartFillScope,
  SMART_FILL_CREATED_META_KEY,
  SMART_FILL_META_KEY,
  SMART_FILL_RELATIONS_META_KEY,
  SMART_FILL_TRIAGE_META_KEY,
} from "@/lib/smart-fill";

type Metadata = Record<string, unknown> | null | undefined;
const resolveCreated = (meta: Metadata) => resolveSmartFillScope(meta, "created");
const resolveTriage = (meta: Metadata) => resolveSmartFillScope(meta, "triage");

/**
 * Account → Smart Fill (MIN-737): one card per option, so each one is a
 * destination of its own in ⌘K and in the settings filter. Smart Fill fills
 * only priority, effort, categories and objective (MIN-260); the scopes and
 * relations depend on the master switch, while issue indexing also serves
 * search and stands on its own (MIN-717).
 */
export function AccountSmartFillSection() {
  const ta = useTranslations("Account");
  const [smartFill, setSmartFill, ready] = useAccountPreference(
    SMART_FILL_META_KEY,
    resolveSmartFill,
  );
  const [created, setCreated] = useAccountPreference(
    SMART_FILL_CREATED_META_KEY,
    resolveCreated,
  );
  const [triage, setTriage] = useAccountPreference(
    SMART_FILL_TRIAGE_META_KEY,
    resolveTriage,
  );
  const [relations, setRelations] = useAccountPreference(
    SMART_FILL_RELATIONS_META_KEY,
    resolveSmartFillRelations,
  );
  const [indexing, setIndexing] = useAccountPreference(
    ISSUE_INDEXING_META_KEY,
    resolveIssueIndexing,
  );

  return (
    <>
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountSmartFill}
        title={ta("smartFillTitle")}
      >
        <SettingsRow
          htmlFor="account-smart-fill"
          label={ta("smartFillLabel")}
          hint={ta("smartFillDesc")}
          control={
            <Switch
              id="account-smart-fill"
              checked={smartFill}
              onCheckedChange={(v) => void setSmartFill(v)}
              disabled={!ready}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountSmartFillScope}
        title={ta("smartFillScopeTitle")}
      >
        <SettingsRow
          htmlFor="account-smart-fill-created"
          label={ta("smartFillCreatedLabel")}
          hint={ta("smartFillCreatedDesc")}
          control={
            <Switch
              id="account-smart-fill-created"
              checked={created}
              onCheckedChange={(v) => void setCreated(v)}
              disabled={!ready || !smartFill}
            />
          }
        />
        <SettingsRow
          htmlFor="account-smart-fill-triage"
          label={ta("smartFillTriageLabel")}
          hint={ta("smartFillTriageDesc")}
          control={
            <Switch
              id="account-smart-fill-triage"
              checked={triage}
              onCheckedChange={(v) => void setTriage(v)}
              disabled={!ready || !smartFill}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountSmartFillRelations}
        title={ta("smartFillRelationsTitle")}
      >
        <SettingsRow
          htmlFor="account-smart-fill-relations"
          label={ta("smartFillRelationsLabel")}
          hint={ta("smartFillRelationsDesc")}
          control={
            <Switch
              id="account-smart-fill-relations"
              checked={relations}
              onCheckedChange={(v) => void setRelations(v)}
              disabled={!ready || !smartFill}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountIssueIndexing}
        title={ta("issueIndexingTitle")}
      >
        <SettingsRow
          htmlFor="account-issue-indexing"
          label={ta("issueIndexingLabel")}
          hint={ta("issueIndexingDesc")}
          control={
            <Switch
              id="account-issue-indexing"
              checked={indexing}
              onCheckedChange={(v) => void setIndexing(v)}
              disabled={!ready}
            />
          }
        />
      </SettingsGroup>
    </>
  );
}
