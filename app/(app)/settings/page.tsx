"use client";

import { useTranslations } from "next-intl";
import {
  Bot,
  GitBranch,
  Inbox,
  IterationCw,
  Lock,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  User,
  Workflow,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useMfaStatusQuery } from "@/lib/use-mfa-status";
import {
  SettingsShell,
  type SettingsTab,
} from "@/components/settings-shell";
import { AccountProfileSection } from "@/components/settings/account-profile-section";
import { AccountSecuritySection } from "@/components/settings/account-security-section";
import { AccountDesktopSection } from "@/components/settings/account-desktop-section";
import { AccountPreferencesSection } from "@/components/settings/account-preferences-section";
import { AccountCyclesSection } from "@/components/settings/account-cycles-section";
import { AccountAutomationsSection } from "@/components/settings/account-automations-section";
import { AccountNotificationsSection } from "@/components/settings/account-notifications-section";
import { AccountPushDevicesSection } from "@/components/settings/account-push-devices-section";
import { AccountMcpSection } from "@/components/settings/account-mcp-section";
import { AccountConnectedAppsSection } from "@/components/settings/account-connected-apps-section";
import { AccountGitConnectionsSection } from "@/components/settings/account-git-connections-section";
import { AccountAiKeysSection } from "@/components/settings/account-ai-keys-section";
import { AccountAnalyticsSection } from "@/components/settings/account-analytics-section";
import { AccountDataSection } from "@/components/settings/account-data-section";
import { SettingsAssistantPrompt } from "@/components/settings-assistant-prompt";
import { ACCOUNT_SETTINGS_DEFAULT_TAB } from "@/lib/settings-sections";

export default function AccountSettingsPage() {
  const t = useTranslations("Account");
  const tAutomations = useTranslations("Automations");
  const { user } = useAuth();
  // The attention badge of the “Security” tab (MIN-132): as long as 2FA
  // is inactive, the recommendation must be visible from the other tabs.
  // Without that it only exists for those who think to look for it — that is to say
  // for those who don't need it.
  const { status: mfa } = useMfaStatusQuery();

  // The sections read the account; hold off until it resolves.
  if (!user) return null;

  const tabs: SettingsTab[] = [
    {
      value: "profile",
      label: t("profileTab"),
      icon: User,
      content: <AccountProfileSection />,
    },
    // Just after the profile: who I am, then how to get into my home.
    {
      value: "security",
      label: t("securityTab"),
      icon: Lock,
      indicator: mfa && !mfa.enabled ? t("securityTabIndicator") : undefined,
      content: <AccountSecuritySection />,
    },
    {
      value: "preferences",
      label: t("preferencesTab"),
      icon: SlidersHorizontal,
      // Desktop app map goes to `null` elsewhere
      // (browser, dev): so it has no conditions here.
      content: (
        <>
          <AccountPreferencesSection />
          <AccountDesktopSection />
        </>
      ),
    },
    {
      value: "cycles",
      label: t("cyclesTab"),
      icon: IterationCw,
      content: <AccountCyclesSection />,
    },
    // Automations just after the cycles: both say how the
    // work progresses on its own, one for me, the other for the agent.
    {
      value: "automations",
      label: tAutomations("title"),
      icon: Workflow,
      content: <AccountAutomationsSection />,
    },
    {
      value: "inbox",
      label: t("inboxTab"),
      icon: Inbox,
      // WHAT lands in the inbox first, WHERE it rings next (MIN-183):
      // push devices only make sense once the categories are chosen,
      // and it is the same rocker which governs the two surfaces.
      content: (
        <>
          <AccountNotificationsSection />
          <AccountPushDevicesSection />
        </>
      ),
    },
    {
      value: "mcp",
      label: t("mcpTab"),
      icon: Plug,
      content: (
        <>
          <AccountMcpSection />
          <AccountConnectedAppsSection />
        </>
      ),
    },
    {
      value: "git",
      label: t("gitTab"),
      icon: GitBranch,
      // A single card: the installation of the App that the projects reuse
      // to link a deposit, and the account under which YOU act on a PR
      // (MIN-144), are two levels of the same forge account. Separated, they
      // forced themselves to quote each other to be understood.
      content: <AccountGitConnectionsSection />,
    },
    {
      value: "agent",
      label: t("agentTab"),
      icon: Bot,
      content: <AccountAiKeysSection />,
    },
    // Last tab: export and deletion of the account (MIN-119). It is
    // where we go when we leave, not where we pass every day.
    {
      value: "data",
      label: t("dataTab"),
      icon: ShieldCheck,
      content: (
        <>
          {/* Audience measurement before export and deletion: this is the
 only setting of this tab that we just CHANGE rather than undergo. */}
          <AccountAnalyticsSection />
          <AccountDataSection />
        </>
      ),
    },
  ];

  return (
    <SettingsShell
      title={t("title")}
      defaultTab={ACCOUNT_SETTINGS_DEFAULT_TAB}
      tabs={tabs}
      filterPlaceholder={(count) => t("filterPlaceholder", { count })}
      topSlot={
        <SettingsAssistantPrompt
          projectId={null}
          placeholder={t("assistantPromptPlaceholder")}
        />
      }
    />
  );
}
