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
import { AccountPreferencesSection } from "@/components/settings/account-preferences-section";
import { AccountCyclesSection } from "@/components/settings/account-cycles-section";
import { AccountAutomationsSection } from "@/components/settings/account-automations-section";
import { AccountNotificationsSection } from "@/components/settings/account-notifications-section";
import { AccountPushDevicesSection } from "@/components/settings/account-push-devices-section";
import { AccountMcpSection } from "@/components/settings/account-mcp-section";
import { AccountConnectedAppsSection } from "@/components/settings/account-connected-apps-section";
import { AccountGitConnectionsSection } from "@/components/settings/account-git-connections-section";
import { AccountAiKeysSection } from "@/components/settings/account-ai-keys-section";
import { AccountDataSection } from "@/components/settings/account-data-section";
import { SettingsAssistantPrompt } from "@/components/settings-assistant-prompt";
import { ACCOUNT_SETTINGS_DEFAULT_TAB } from "@/lib/settings-sections";

export default function AccountSettingsPage() {
  const t = useTranslations("Account");
  const tAutomations = useTranslations("Automations");
  const { user } = useAuth();
  // La pastille d'attention de l'onglet « Sécurité » (MIN-132) : tant que la 2FA
  // est inactive, la recommandation doit être visible depuis les autres onglets.
  // Sans ça elle n'existe que pour qui pense à aller la chercher — c'est-à-dire
  // pour qui n'en a pas besoin.
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
    // Juste après le profil : qui je suis, puis comment on entre chez moi.
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
      content: <AccountPreferencesSection />,
    },
    {
      value: "cycles",
      label: t("cyclesTab"),
      icon: IterationCw,
      content: <AccountCyclesSection />,
    },
    // Les automatisations juste après les cycles : les deux disent comment le
    // travail avance tout seul, l'un pour moi, l'autre pour l'agent.
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
      // CE QUI atterrit dans l'inbox d'abord, OÙ ça sonne ensuite (MIN-183) :
      // les appareils push n'ont de sens qu'une fois les catégories choisies,
      // et c'est la même bascule qui gouverne les deux surfaces.
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
      // Une seule carte : l'installation de l'App que les projets réutilisent
      // pour lier un dépôt, et le compte sous lequel VOUS agissez sur une PR
      // (MIN-144), sont deux niveaux du même compte de forge. Séparés, ils
      // s'obligeaient à se citer l'un l'autre pour être compris.
      content: <AccountGitConnectionsSection />,
    },
    {
      value: "agent",
      label: t("agentTab"),
      icon: Bot,
      content: <AccountAiKeysSection />,
    },
    // Dernier onglet : l'export et la suppression du compte (MIN-119). C'est
    // là qu'on va quand on part, pas là qu'on passe tous les jours.
    {
      value: "data",
      label: t("dataTab"),
      icon: ShieldCheck,
      content: <AccountDataSection />,
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
