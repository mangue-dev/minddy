"use client";

import { useTranslations } from "next-intl";
import { Bot, GitBranch, Inbox, IterationCw, Plug, SlidersHorizontal, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  SettingsShell,
  type SettingsTab,
} from "@/components/settings-shell";
import { AccountProfileSection } from "@/components/settings/account-profile-section";
import { AccountPreferencesSection } from "@/components/settings/account-preferences-section";
import { AccountCyclesSection } from "@/components/settings/account-cycles-section";
import { AccountNotificationsSection } from "@/components/settings/account-notifications-section";
import { AccountMcpSection } from "@/components/settings/account-mcp-section";
import { AccountConnectedAppsSection } from "@/components/settings/account-connected-apps-section";
import { AccountGitConnectionsSection } from "@/components/settings/account-git-connections-section";
import { AccountAiKeysSection } from "@/components/settings/account-ai-keys-section";
import { SettingsAssistantPrompt } from "@/components/settings-assistant-prompt";

export default function AccountSettingsPage() {
  const t = useTranslations("Account");
  const { user } = useAuth();

  // The sections read the account; hold off until it resolves.
  if (!user) return null;

  const tabs: SettingsTab[] = [
    {
      value: "profile",
      label: t("profileTab"),
      icon: User,
      content: <AccountProfileSection />,
    },
    {
      value: "preferences",
      label: t("preferencesTab"),
      icon: SlidersHorizontal,
      content: <AccountPreferencesSection />,
    },
    {
      value: "cycles",
      label: t("cyclesTab"),
      icon: IterationCw,
      content: <AccountCyclesSection />,
    },
    {
      value: "inbox",
      label: t("inboxTab"),
      icon: Inbox,
      content: <AccountNotificationsSection />,
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
      content: <AccountGitConnectionsSection />,
    },
    {
      value: "agent",
      label: t("agentTab"),
      icon: Bot,
      content: <AccountAiKeysSection />,
    },
  ];

  return (
    <SettingsShell
      title={t("title")}
      defaultTab="profile"
      tabs={tabs}
      maxWidth={880}
      topSlot={
        <SettingsAssistantPrompt
          projectId={null}
          placeholder={t("assistantPromptPlaceholder")}
        />
      }
    />
  );
}
