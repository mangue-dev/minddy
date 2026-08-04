"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, ConfirmDeleteDialog, Spinner, cn, toast } from "mangue-ui";
import { GitBranch, Github, Gitlab } from "lucide-react";
import {
  disconnectGitConnectionApi,
  disconnectGitIdentityApi,
  startAccountGitConnectApi,
  startGitIdentityConnectApi,
} from "@/lib/git-integration-api";
import {
  gitConnectionsQueryKey,
  useGitConnectionsQuery,
} from "@/lib/use-git-connections-query";
import {
  gitIdentitiesQueryKey,
  useGitIdentitiesQuery,
} from "@/lib/use-git-identities-query";
import { getRepoProvider, type RepoProviderId } from "@/lib/repo-providers";
import { ProviderConnectMenu } from "@/components/git/provider-connect-buttons";
import {
  SettingsEmpty,
  SettingsGroup,
  SettingsListRow,
} from "@/components/settings/settings-ui";
import { EmptyScene } from "@/components/empty-scene";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import type { GitConnection, GitIdentity } from "@/lib/types";

const PROVIDER_ICON = { github: Github, gitlab: Gitlab } as const;

/**
 * « Comptes git connectés » (MIN-47 + MIN-144) : un compte de forge par bloc,
 * avec ses DEUX niveaux l'un sous l'autre.
 *
 *   ┌ GitHub · mangue-dev        12 juil. · 3 projets   [Déconnecter] ┐
 *   ├ minddy peut agir en votre nom                       [Révoquer]  ┤
 *
 * Les deux vivaient dans deux cartes séparées, et il fallait recoller de tête
 * « GitHub · mangue-dev » d'en bas avec « GitHub — pas encore autorisé » d'en
 * haut. Sous le même bloc, la question « de quel compte parle-t-on » ne se pose
 * plus, et la hiérarchie est lisible : la connexion PORTE l'autorisation.
 *
 * D'où le survol teinté, qui dit la portée avant le clic : survoler
 * « Déconnecter » rougit tout le bloc (la connexion part, et l'autorisation
 * avec) ; survoler « Révoquer » ne rougit que sa ligne (seule l'autorisation
 * saute, la connexion reste). Le focus clavier fait pareil — le signal ne
 * s'adresse pas qu'à la souris.
 */

/** Un compte de forge : sa connexion, son autorisation, ou l'une des deux. */
interface AccountBlock {
  key: string;
  provider: RepoProviderId;
  /** L'installation de l'app / l'OAuth qui donne accès aux dépôts. */
  connection: GitConnection | null;
  /** L'autorisation d'agir en votre nom sur une pull request. */
  identity: GitIdentity | null;
}

/**
 * Assemble les blocs. Une identité est UNIQUE par provider (« MON compte git »,
 * au singulier) alors qu'on peut avoir plusieurs connexions chez la même forge
 * — une par organisation où l'app est installée. Elle se pose donc sur la
 * connexion du MÊME compte, à défaut sur la première ; sans connexion du tout,
 * elle tient son bloc seule (on peut autoriser son compte sans jamais avoir
 * installé l'app, quand c'est un autre membre qui a lié le dépôt).
 */
function buildBlocks(
  connections: GitConnection[],
  identities: GitIdentity[],
  deployed: RepoProviderId[],
): AccountBlock[] {
  const blocks: AccountBlock[] = connections.map((c) => ({
    key: c.id,
    provider: c.provider,
    connection: c,
    identity: null,
  }));

  for (const identity of identities) {
    const siblings = blocks.filter((b) => b.provider === identity.provider);
    const host =
      siblings.find(
        (b) =>
          b.connection?.account_login &&
          b.connection.account_login === identity.account_login,
      ) ?? siblings[0];
    if (host) host.identity = identity;
    else {
      blocks.push({
        key: `identity-${identity.id}`,
        provider: identity.provider,
        connection: null,
        identity,
      });
    }
  }

  // Rien encore : une ligne par forge déployée, pour avoir où s'autoriser.
  // Dès qu'une forge est utilisée, on ne parle plus que de celle-là.
  if (blocks.length === 0) {
    return deployed.map((id) => ({
      key: `provider-${id}`,
      provider: id,
      connection: null,
      identity: null,
    }));
  }
  return blocks;
}

export function AccountGitConnectionsSection() {
  const t = useTranslations("Account");
  const tc = useTranslations("Common");
  // Les libellés de la connexion git vivent dans `Settings` : ce sont les mêmes
  // mots que dans un projet, et les recopier ici les ferait diverger.
  const tSettings = useTranslations("Settings");
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { connections, providers, loading } = useGitConnectionsQuery();
  const { identities, loading: identitiesLoading } = useGitIdentitiesQuery();

  const [toDisconnect, setToDisconnect] = useState<GitConnection | null>(null);
  const [toRevoke, setToRevoke] = useState<GitIdentity | null>(null);
  const [connecting, setConnecting] = useState<RepoProviderId | null>(null);
  const [authorizing, setAuthorizing] = useState<RepoProviderId | null>(null);

  // Retour de callback (?git=connected | ?git=error), posé par
  // /api/git/{github/setup,github/user-callback,gitlab/callback}.
  const handledCallback = useRef(false);
  useEffect(() => {
    if (handledCallback.current) return;
    const status = searchParams.get("git");
    if (!status) return;
    handledCallback.current = true;
    if (status === "connected") {
      toast.success(tSettings("gitConnectedToast"));
      void queryClient.invalidateQueries({ queryKey: gitConnectionsQueryKey });
      void queryClient.invalidateQueries({ queryKey: gitIdentitiesQueryKey });
    } else if (status === "error") {
      toast.error(tSettings("gitConnectError"));
    }
    // Retire les params de callback en conservant l'onglet.
    const next = new URLSearchParams(searchParams);
    next.delete("git");
    next.delete("connection");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, pathname, router, queryClient, tSettings]);

  const handleConnect = async (provider: RepoProviderId) => {
    setConnecting(provider);
    try {
      const res = await startAccountGitConnectApi(provider, "settings");
      if (res.mode === "reuse") {
        // Rien à installer : la connexion existait déjà, elle est juste remontée.
        void queryClient.invalidateQueries({ queryKey: gitConnectionsQueryKey });
      } else {
        window.location.href = res.url; // sortie de page vers la forge
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setConnecting(null);
    }
  };

  const handleAuthorize = async (provider: RepoProviderId) => {
    if (authorizing) return;
    setAuthorizing(provider);
    try {
      const { url } = await startGitIdentityConnectApi(provider, "settings");
      window.location.href = url;
    } catch (err) {
      toast.error((err as Error).message);
      setAuthorizing(null);
    }
  };

  const handleDisconnect = async () => {
    if (!toDisconnect) return;
    try {
      await disconnectGitConnectionApi(toDisconnect.id);
      toast.success(t("gitDisconnectedToast"));
      void queryClient.invalidateQueries({ queryKey: gitConnectionsQueryKey });
      void queryClient.invalidateQueries({ queryKey: gitIdentitiesQueryKey });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleRevoke = async () => {
    if (!toRevoke) return;
    try {
      await disconnectGitIdentityApi(toRevoke.id, toRevoke.provider);
      toast.success(t("gitIdentityRevokedToast"));
      void queryClient.invalidateQueries({ queryKey: gitIdentitiesQueryKey });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const deployed = providers.filter((p) => p.configured).map((p) => p.id);
  const blocks = buildBlocks(connections, identities, deployed);
  const connectMenu = (
    <ProviderConnectMenu
      onConnect={handleConnect}
      connecting={connecting}
      only={deployed}
    />
  );

  return (
    <>
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountGitConnections}
        icon={GitBranch}
        title={t("gitConnectionsTitle")}
        description={t("gitConnectionsDesc")}
        help={t("gitConnectionsHelp")}
        variant="block"
        /* Le geste vit en bout de titre ; sans compte il descend dans la scène
           et n'est pas montré deux fois. */
        action={
          connections.length > 0 && deployed.length > 0 ? connectMenu : undefined
        }
      >
        {/* Les deux requêtes décident du contenu d'un même bloc : les attendre
            toutes les deux, sinon la ligne d'autorisation saute d'un état à
            l'autre sous les yeux. */}
        {loading || identitiesLoading ? (
          <SettingsEmpty className="py-0">{tc("loading")}</SettingsEmpty>
        ) : blocks.length === 0 ? (
          <EmptyScene
            size="compact"
            icon={GitBranch}
            title={
              deployed.length > 0
                ? t("gitConnectionsEmpty")
                : tSettings("gitNotConfigured")
            }
          >
            {deployed.length > 0 && connectMenu}
          </EmptyScene>
        ) : (
          <div className="flex flex-col gap-3">
            {blocks.map((block) => (
              <GitAccountBlock
                key={block.key}
                block={block}
                authorizing={authorizing === block.provider}
                authorizeDisabled={!!authorizing}
                onAuthorize={() => void handleAuthorize(block.provider)}
                onDisconnect={() => setToDisconnect(block.connection)}
                onRevoke={() => setToRevoke(block.identity)}
              />
            ))}
          </div>
        )}
      </SettingsGroup>

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
        cancelLabel={tc("cancel")}
        onConfirm={handleDisconnect}
      />

      <ConfirmDeleteDialog
        open={!!toRevoke}
        onOpenChange={(open) => !open && setToRevoke(null)}
        title={t("gitIdentityRevokeTitle", {
          provider: toRevoke ? getRepoProvider(toRevoke.provider).displayName : "",
        })}
        description={t("gitIdentityRevokeDescription")}
        confirmLabel={t("gitIdentityRevoke")}
        cancelLabel={tc("cancel")}
        onConfirm={handleRevoke}
      />
    </>
  );
}

/**
 * Un compte, ses deux niveaux, et la portée de chaque geste rendue AVANT le
 * clic : `danger` dit quelle région le bouton survolé emporterait.
 */
function GitAccountBlock({
  block,
  authorizing,
  authorizeDisabled,
  onAuthorize,
  onDisconnect,
  onRevoke,
}: {
  block: AccountBlock;
  authorizing: boolean;
  authorizeDisabled: boolean;
  onAuthorize: () => void;
  onDisconnect: () => void;
  onRevoke: () => void;
}) {
  const t = useTranslations("Account");
  const format = useFormatter();
  const [danger, setDanger] = useState<"account" | "identity" | null>(null);

  const { connection, identity } = block;
  const Icon = PROVIDER_ICON[block.provider];
  const name = getRepoProvider(block.provider).displayName;
  const login = identity?.account_login ?? connection?.account_login ?? null;

  // Le compte GitLab EST la connexion OAuth : la révoquer ici délierait les
  // dépôts des projets. Ça se fait par « Déconnecter », dont la confirmation
  // porte l'avertissement — donc pas de second bouton sur cette ligne.
  const revocable = identity?.source === "identity";

  const status = identity
    ? identity.source === "connection"
      ? t("gitIdentityFromConnection")
      : t("gitIdentityAuthorized")
    : t("gitIdentityNotAuthorized");

  /** Survol ET focus : le signal ne s'adresse pas qu'à la souris. */
  const scope = (region: "account" | "identity") => ({
    onMouseEnter: () => setDanger(region),
    onMouseLeave: () => setDanger(null),
    onFocus: () => setDanger(region),
    onBlur: () => setDanger(null),
  });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border transition-colors",
        danger === "account"
          ? "border-destructive/30 bg-destructive/5"
          : "border-border",
      )}
    >
      <SettingsListRow
        className="px-3 py-2.5"
        avatar={
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
              danger === "account"
                ? "bg-destructive/10 text-destructive"
                : connection
                  ? "bg-brand/10 text-brand"
                  : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
          </span>
        }
        title={`${name}${login ? ` · ${login}` : ""}`}
        subtitle={
          connection
            ? format.dateTime(new Date(connection.created_at), {
                dateStyle: "medium",
              }) +
              (connection.projects.length > 0
                ? ` · ${t("gitConnectionUsedBy", { count: connection.projects.length })}`
                : "")
            : undefined
        }
        action={
          connection && (
            // Déconnecter délie les dépôts de tous les projets qui s'en
            // servaient, et emporte l'autorisation avec : le bloc entier rougit.
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onDisconnect}
              {...scope("account")}
            >
              {t("gitDisconnect")}
            </Button>
          )
        }
      />

      <div
        className={cn(
          "flex items-center gap-3 border-t px-3 py-2 transition-colors",
          danger === "identity"
            ? "border-destructive/30 bg-destructive/5"
            : danger === "account"
              ? "border-destructive/30"
              : "border-border",
        )}
      >
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">{status}</p>
        {revocable ? (
          // Seule l'autorisation saute : la teinte s'arrête à cette ligne.
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onRevoke}
            {...scope("identity")}
          >
            {t("gitIdentityRevoke")}
          </Button>
        ) : identity ? null : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={authorizeDisabled}
            onClick={onAuthorize}
          >
            {authorizing && <Spinner />}
            {t("gitIdentityAuthorize")}
          </Button>
        )}
      </div>
    </div>
  );
}
