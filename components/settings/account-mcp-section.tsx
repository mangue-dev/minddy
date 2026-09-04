"use client";

import { useTranslations } from "next-intl";
import { Plug } from "lucide-react";
import { SettingsGroup } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { AccountMcpClients } from "./account-mcp-clients";
import { McpConnectPanel } from "@/components/settings/mcp-connect-panel";

/** Account settings → MCP: the “Connect an agent” panel, shared with
 the MCP stage of onboarding (MIN-74) — it does not change, only its frame. */
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
      <AccountMcpClients />
    </SettingsGroup>
  );
}
