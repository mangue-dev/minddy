"use client";

import { useTranslations } from "next-intl";
import { Plug } from "lucide-react";
import { SettingsGroup } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { McpConnectPanel } from "@/components/settings/mcp-connect-panel";

/** Réglages du compte → MCP : le panneau « Connecter un agent », partagé avec
    l'étape MCP de l'onboarding (MIN-74) — il ne change pas, seul son cadre. */
export function AccountMcpSection() {
  const t = useTranslations("Account");

  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.accountMcp}
      icon={Plug}
      title={t("mcpSectionTitle")}
      description={t("mcpSectionDesc")}
      variant="block"
    >
      <McpConnectPanel />
    </SettingsGroup>
  );
}
