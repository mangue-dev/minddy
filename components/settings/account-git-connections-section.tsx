"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, ConfirmDeleteDialog, toast } from "mangue-ui";
import { Github, Gitlab } from "lucide-react";
import { disconnectGitConnectionApi } from "@/lib/git-integration-api";
import {
  gitConnectionsQueryKey,
  useGitConnectionsQuery,
} from "@/lib/use-git-connections-query";
import { getRepoProvider } from "@/lib/repo-providers";
import { SettingsSection } from "@/components/settings-shell";
import type { GitConnection } from "@/lib/types";

const PROVIDER_ICON = { github: Github, gitlab: Gitlab } as const;

/**
 * « Comptes git connectés » (MIN-47) : les connexions GitHub/GitLab au niveau
 * compte, réutilisables sur tous les projets. On se connecte depuis les
 * paramètres d'un projet ; ici on visualise et on déconnecte. Déconnecter délie
 * les dépôts de tous les projets qui utilisaient cette connexion (cascade).
 */
export function AccountGitConnectionsSection() {
  const t = useTranslations("Account");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const queryClient = useQueryClient();

  const { connections, loading } = useGitConnectionsQuery();
  const [toDisconnect, setToDisconnect] = useState<GitConnection | null>(null);

  const handleDisconnect = async () => {
    if (!toDisconnect) return;
    try {
      await disconnectGitConnectionApi(toDisconnect.id);
      toast.success(t("gitDisconnectedToast"));
      void queryClient.invalidateQueries({ queryKey: gitConnectionsQueryKey });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <SettingsSection
      title={t("gitConnectionsTitle")}
      description={t("gitConnectionsDesc")}
    >
      {loading ? (
        <p className="py-2 text-sm text-muted-foreground">{tc("loading")}</p>
      ) : connections.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          {t("gitConnectionsEmpty")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {connections.map((c) => {
            const Icon = PROVIDER_ICON[c.provider];
            return (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {getRepoProvider(c.provider).displayName}
                    {c.account_login ? ` · ${c.account_login}` : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {format.dateTime(new Date(c.created_at), {
                      dateStyle: "medium",
                    })}
                    {c.projects.length > 0
                      ? ` · ${t("gitConnectionUsedBy", { count: c.projects.length })}`
                      : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setToDisconnect(c)}
                >
                  {t("gitDisconnect")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDeleteDialog
        open={!!toDisconnect}
        onOpenChange={(open) => !open && setToDisconnect(null)}
        title={t("gitDisconnectTitle", {
          provider: toDisconnect
            ? getRepoProvider(toDisconnect.provider).displayName
            : "",
        })}
        description={
          toDisconnect && toDisconnect.projects.length > 0
            ? t("gitDisconnectDescriptionLinked", {
                projects: toDisconnect.projects.map((p) => p.name).join(", "),
              })
            : t("gitDisconnectDescription")
        }
        confirmLabel={t("gitDisconnect")}
        onConfirm={handleDisconnect}
      />
    </SettingsSection>
  );
}
