"use client";

import { useTranslations } from "next-intl";
import { Plug } from "lucide-react";
import { SettingsGroup } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { AccountMcpClients } from "./account-mcp-clients";
import { McpConnectPanel } from "@/components/settings/mcp-connect-panel";

/** Inbound connections let external assistants use Minddy. */
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

/** Personal outbound connections let Numo use other services. */
export function AccountMcpClientsSection() {
  const t = useTranslations("McpClients");
  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.accountMcpClients}
      icon={Plug}
      title={t("title")}
      description={t("description")}
      variant="block"
    >
      <AccountMcpClients />
    </SettingsGroup>
  );
}
