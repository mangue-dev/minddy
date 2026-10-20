"use client";

import { useTranslations } from "next-intl";
import { AiAutoRotateIcon as CycleIcon, BotIcon as Bot, GitBranchIcon as GitBranch, InboxIcon as Inbox, LockIcon, PlugIcon as Plug, ShieldCheckIcon as ShieldCheck, SlidersHorizontalIcon as SlidersHorizontal, TicketIcon as Ticket, UserIcon as User, ViewOffIcon } from "@hugeicons/core-free-icons";
import { SMART_FILL_ICON } from "@/components/feature-icons";
import { useAuth } from "@/lib/auth-context";
import { useMfaStatusQuery } from "@/lib/use-mfa-status";
import type { SidebarBrowseTarget } from "@/components/secondary-sidebar";
import { SettingsShell, type SettingsTab } from "@/components/settings-shell";
import { AccountProfileSection } from "@/components/settings/account-profile-section";
import { AccountSecuritySection } from "@/components/settings/account-security-section";
import { AccountDesktopSection } from "@/components/settings/account-desktop-section";
import { AccountPreferencesSection } from "@/components/settings/account-preferences-section";
import { AccountCyclesSection } from "@/components/settings/account-cycles-section";
import { AccountHiddenProjectsSection } from "@/components/settings/account-hidden-projects-section";
import { AccountNotificationsSection } from "@/components/settings/account-notifications-section";
import { AccountPushDevicesSection } from "@/components/settings/account-push-devices-section";
import {
  AccountMcpSection,
  AccountMcpClientsSection,
} from "@/components/settings/account-mcp-section";
import { AccountConnectedAppsSection } from "@/components/settings/account-connected-apps-section";
import { AccountGitConnectionsSection } from "@/components/settings/account-git-connections-section";
import { AccountAiKeysSection } from "@/components/settings/account-ai-keys-section";
import { AccountAnalyticsSection } from "@/components/settings/account-analytics-section";
import { AccountDataSection } from "@/components/settings/account-data-section";
import { AccountIssuesSection, AccountNumoIssuesSection } from "@/components/settings/account-issues-section";
import { AccountSmartFillSection } from "@/components/settings/account-smart-fill-section";
import {
  ACCOUNT_SETTINGS_DEFAULT_TAB,
  ACCOUNT_SETTINGS_TAB_ALIASES,
  type AccountSettingsTab,
} from "@/lib/settings-sections";
import { useAssistantContext } from "@/lib/assistant-panel-context";

export default function AccountSettingsPage({ browse }: { browse?: SidebarBrowseTarget } = {}) {
  const t = useTranslations("Account");
  const { user } = useAuth();
  useAssistantContext(!browse && user ? { settings: "account" } : null);
  // The attention badge of the “Security” tab (MIN-132): as long as 2FA
  // is inactive, the recommendation must be visible from the other tabs.
  // Without that it only exists for those who think to look for it — that is to say
  // for those who don't need it.
  const { status: mfa } = useMfaStatusQuery();

  // The sections read the account; hold off until it resolves.
  if (!user) return null;

  // One tab per subject (MIN-737): each group of related settings lives in
  // one place, and a card is never split across two tabs.
  const tabs: (SettingsTab & { value: AccountSettingsTab })[] = [
    // Who I am and what I did: identity, then the personal statistics.
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
      icon: LockIcon,
      indicator: mfa && !mfa.enabled ? t("securityTabIndicator") : undefined,
      content: <AccountSecuritySection />,
    },
    // How minddy looks and behaves on my screens.
    {
      value: "preferences",
      label: t("preferencesTab"),
      icon: SlidersHorizontal,
      content: (
        <>
          <AccountPreferencesSection />
          <AccountDesktopSection />
        </>
      ),
    },
    // Which projects my navigation shows: a list that grows with the
    // workspace, not a preference among others.
    {
      value: "hidden-projects",
      label: t("hiddenProjectsTitle"),
      icon: ViewOffIcon,
      content: <AccountHiddenProjectsSection />,
    },
    // What happens to an issue because of me.
    {
      value: "issues",
      label: t("issuesTab"),
      icon: Ticket,
      content: <AccountIssuesSection />,
    },
    {
      value: "smart-fill",
      label: t("smartFillTab"),
      icon: SMART_FILL_ICON,
      content: <AccountSmartFillSection />,
    },
    {
      value: "cycles",
      label: t("cyclesTab"),
      icon: CycleIcon,
      content: <AccountCyclesSection />,
    },
    {
      value: "inbox",
      label: t("inboxTab"),
      icon: Inbox,
      // WHAT lands in the inbox first, WHERE it rings next (MIN-183):
      // push devices only make sense once the categories are chosen,
      // and the same switch governs both surfaces.
      content: (
        <>
          <AccountNotificationsSection />
          <AccountPushDevicesSection />
        </>
      ),
    },
    // Everything Numo and the AI features use: the provider key, the MCP
    // servers Numo connects to, and where the issues it creates land.
    {
      value: "agent",
      label: t("agentTab"),
      icon: Bot,
      content: (
        <>
          <AccountAiKeysSection />
          <AccountMcpClientsSection />
          <AccountNumoIssuesSection />
        </>
      ),
    },
    // The other direction: assistants and apps that connect TO minddy.
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
      content: <AccountGitConnectionsSection />,
    },
    // Last tab: privacy, export and deletion of the account (MIN-119). It is
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
        browse={browse}
      title={t("title")}
      defaultTab={ACCOUNT_SETTINGS_DEFAULT_TAB}
      tabs={tabs}
      tabAliases={ACCOUNT_SETTINGS_TAB_ALIASES}
      filterPlaceholder={(count) => t("filterPlaceholder", { count })}
    />
  );
}
