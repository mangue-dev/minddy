"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, ConfirmDeleteDialog, toast } from "mangue-ui";
import { AppWindow, Globe } from "lucide-react";
import { revokeOAuthGrantApi, type OAuthGrant } from "@/lib/oauth-grants-api";
import { oauthGrantsQueryKey, useOAuthGrantsQuery } from "@/lib/use-oauth-grants-query";
import { getMcpAgent, isMcpAgentId } from "@/lib/mcp-agents";
import {
  SettingsEmpty,
  SettingsGroup,
  SettingsListRow,
} from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { BrandLogo } from "@/components/brand-logo";

/** « Applications connectées » : les grants OAuth actifs (agents connectés
    via le consentement navigateur, sans clé). Révoquer coupe l'accès
    immédiatement — access token, refresh token et attribution future. */
export function AccountConnectedAppsSection() {
  const t = useTranslations("Account");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const queryClient = useQueryClient();

  const { grants, loading } = useOAuthGrantsQuery();
  const [toRevoke, setToRevoke] = useState<OAuthGrant | null>(null);

  const handleRevoke = async () => {
    if (!toRevoke) return;
    try {
      await revokeOAuthGrantApi(toRevoke.id);
      toast.success(t("connectedAppRevokedToast", { name: toRevoke.client_name }));
      void queryClient.invalidateQueries({ queryKey: oauthGrantsQueryKey });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const lastUsed = (grant: OAuthGrant) =>
    grant.last_used_at
      ? t("apiKeyLastUsed", {
          date: format.dateTime(new Date(grant.last_used_at), {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        })
      : t("apiKeyNeverUsed");

  return (
    <>
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountConnectedApps}
        icon={AppWindow}
        title={t("connectedAppsTitle")}
        description={t("connectedAppsDesc")}
      >
        {loading ? (
          <SettingsEmpty>{tc("loading")}</SettingsEmpty>
        ) : grants.length === 0 ? (
          <SettingsEmpty>{t("connectedAppsEmpty")}</SettingsEmpty>
        ) : (
          grants.map((grant) => (
            <SettingsListRow
              key={grant.id}
              avatar={
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                  {isMcpAgentId(grant.agent) ? (
                    <BrandLogo brand={getMcpAgent(grant.agent)} className="size-4" />
                  ) : (
                    <Globe className="size-4" />
                  )}
                </span>
              }
              title={grant.client_name}
              subtitle={
                <>
                  {format.dateTime(new Date(grant.created_at), { dateStyle: "medium" })}
                  {" · "}
                  {lastUsed(grant)}
                </>
              }
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setToRevoke(grant)}
                >
                  {t("apiKeyRevoke")}
                </Button>
              }
            />
          ))
        )}
      </SettingsGroup>

      <ConfirmDeleteDialog
        open={!!toRevoke}
        onOpenChange={(open) => !open && setToRevoke(null)}
        title={t("connectedAppRevokeTitle", { name: toRevoke?.client_name ?? "" })}
        description={t("connectedAppRevokeDescription")}
        confirmLabel={t("apiKeyRevoke")}
        cancelLabel={tc("cancel")}
        onConfirm={handleRevoke}
      />
    </>
  );
}
