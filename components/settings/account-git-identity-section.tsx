"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, ConfirmDeleteDialog, cn, toast } from "mangue-ui";
import { Github, Gitlab, UserRoundCheck } from "lucide-react";
import {
  disconnectGitIdentityApi,
  startGitIdentityConnectApi,
} from "@/lib/git-integration-api";
import {
  gitIdentitiesQueryKey,
  useGitIdentitiesQuery,
} from "@/lib/use-git-identities-query";
import { useGitConnectionsQuery } from "@/lib/use-git-connections-query";
import { getRepoProvider, type RepoProviderId } from "@/lib/repo-providers";
import {
  SettingsEmpty,
  SettingsGroup,
  SettingsListRow,
} from "@/components/settings/settings-ui";
import type { GitIdentity } from "@/lib/types";

const PROVIDER_ICON = { github: Github, gitlab: Gitlab } as const;

/**
 * « Agir en votre nom » (MIN-144) : le compte git sous lequel partent VOS gestes
 * sur une pull request — approuver, commenter, répondre, résoudre un fil,
 * fusionner.
 *
 * Le vocabulaire est volontairement AUTRE que celui de la section voisine
 * (« Comptes git connectés » = l'installation de l'app, qui donne accès aux
 * dépôts) : on AUTORISE ici, on CONNECTE là-bas. Sans cet écart de mots, les
 * deux sections se contredisent à l'écran — « aucun compte connecté » juste
 * au-dessus de « GitHub · mangue-dev ». C'est exactement ce qui s'est produit,
 * et c'est pour ça qu'une ligne par provider remplace l'ancien état vide : un
 * provider a toujours quelque chose à dire, jamais « rien ».
 */
export function AccountGitIdentitySection() {
  const t = useTranslations("Account");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const queryClient = useQueryClient();

  const { identities, providers, loading } = useGitIdentitiesQuery();
  // L'installation de l'app, pour pouvoir NOMMER la section voisine plutôt que
  // de laisser l'utilisateur arbitrer entre deux affirmations opposées.
  const { connections } = useGitConnectionsQuery();
  const [toDisconnect, setToDisconnect] = useState<GitIdentity | null>(null);
  const [connecting, setConnecting] = useState<RepoProviderId | null>(null);

  const authorize = async (provider: RepoProviderId) => {
    if (connecting) return;
    setConnecting(provider);
    try {
      const { url } = await startGitIdentityConnectApi(provider, "settings");
      window.location.href = url;
    } catch (err) {
      toast.error((err as Error).message);
      setConnecting(null);
    }
  };

  const handleDisconnect = async () => {
    if (!toDisconnect) return;
    try {
      await disconnectGitIdentityApi(toDisconnect.id, toDisconnect.provider);
      toast.success(t("gitIdentityRevokedToast"));
      void queryClient.invalidateQueries({ queryKey: gitIdentitiesQueryKey });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <>
      <SettingsGroup
        icon={UserRoundCheck}
        title={t("gitIdentityTitle")}
        description={t("gitIdentityDesc")}
      >
        {loading ? (
          <SettingsEmpty>{tc("loading")}</SettingsEmpty>
        ) : (
          providers.map((p) => {
            const Icon = PROVIDER_ICON[p.id];
            const name = getRepoProvider(p.id).displayName;
            const identity = identities.find((i) => i.provider === p.id);
            const installed = connections.some((c) => c.provider === p.id);

            // Trois états, et chacun dit CE QUI MANQUE plutôt que « rien ».
            const status = identity
              ? identity.source === "connection"
                ? t("gitIdentityFromConnection")
                : t("gitIdentityAuthorizedOn", {
                    date: format.dateTime(new Date(identity.created_at), {
                      dateStyle: "medium",
                    }),
                  })
              : !p.configured
                ? t("gitIdentityUnavailable")
                : installed
                  ? // Le cas qui piégeait : l'app EST installée sur ce compte, ce
                    // que la section voisine affiche. Il faut donc dire en quoi
                    // agir en son nom est une autre autorisation.
                    t("gitIdentityInstalledNotAuthorized")
                  : t("gitIdentityNotAuthorized");

            return (
              <SettingsListRow
                key={p.id}
                avatar={
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full",
                      identity
                        ? "bg-brand/10 text-brand"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                }
                title={`${name}${identity?.account_login ? ` · ${identity.account_login}` : ""}`}
                subtitle={status}
                // PAS de troncature ici : c'est cette ligne qui explique
                // pourquoi le geste n'est pas offert. Coupée, elle laisse
                // exactement le malentendu qu'elle est là pour lever.
                truncateSubtitle={false}
                action={
                  identity ? (
                    // Le compte GitLab EST la connexion OAuth : le révoquer ici
                    // délierait les dépôts des projets. Ça se fait en dessous, où
                    // l'avertissement est écrit.
                    identity.source === "identity" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setToDisconnect(identity)}
                      >
                        {t("gitIdentityRevoke")}
                      </Button>
                    ) : null
                  ) : p.configured ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!!connecting}
                      onClick={() => void authorize(p.id)}
                    >
                      {t("gitIdentityAuthorize")}
                    </Button>
                  ) : null
                }
              />
            );
          })
        )}
      </SettingsGroup>

      <ConfirmDeleteDialog
        open={!!toDisconnect}
        onOpenChange={(open) => !open && setToDisconnect(null)}
        title={t("gitIdentityRevokeTitle", {
          provider: toDisconnect ? getRepoProvider(toDisconnect.provider).displayName : "",
        })}
        description={t("gitIdentityRevokeDescription")}
        confirmLabel={t("gitIdentityRevoke")}
        cancelLabel={tc("cancel")}
        onConfirm={handleDisconnect}
      />
    </>
  );
}
