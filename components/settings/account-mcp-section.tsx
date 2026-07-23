"use client";

import { useTranslations } from "next-intl";
import { SettingsSection } from "@/components/settings-shell";
import { McpConnectPanel } from "@/components/settings/mcp-connect-panel";

/** Réglages du compte → MCP : le panneau « Connecter un agent », partagé avec
    l'étape MCP de l'onboarding (MIN-74). */
export function AccountMcpSection() {
  const t = useTranslations("Account");

  return (
    <SettingsSection title={t("mcpSectionTitle")} description={t("mcpSectionDesc")}>
      <McpConnectPanel />
    </SettingsSection>
  );
}
