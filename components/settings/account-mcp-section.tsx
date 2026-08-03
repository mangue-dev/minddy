"use client";

import { useTranslations } from "next-intl";
import { Plug } from "lucide-react";
import { SettingsGroup } from "@/components/settings/settings-ui";
import { McpConnectPanel } from "@/components/settings/mcp-connect-panel";

/** Réglages du compte → MCP : le panneau « Connecter un agent », partagé avec
    l'étape MCP de l'onboarding (MIN-74) — il ne change pas, seul son cadre. */
export function AccountMcpSection() {
  const t = useTranslations("Account");

  return (
    <SettingsGroup
      icon={Plug}
      title={t("mcpSectionTitle")}
      description={t("mcpSectionDesc")}
      variant="block"
    >
      <McpConnectPanel />
    </SettingsGroup>
  );
}
