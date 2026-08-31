"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, ConfirmDeleteDialog, Input, Spinner, cn, toast } from "mangue-ui";
import { GitBranch } from "lucide-react";
import { Github, Gitlab } from "@/components/git/provider-icons";
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
  SettingsRow,
} from "@/components/settings/settings-ui";
import { EmptyScene } from "@/components/empty-scene";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import type { GitConnection, GitIdentity } from "@/lib/types";
import { saveAgentPreferencesApi } from "@/lib/agent-keys-api";
import {
  agentPreferencesQueryKey,
  useAgentPreferencesQuery,
} from "@/lib/use-agent-preferences-query";

const PROVIDER_ICON = { github: Github, gitlab: Gitlab } as const;

/**
 * “Connected git accounts” (MIN-47 + MIN-144): one forge account per block,
 * with its TWO levels one under the other.
 *
 * ┌ GitHub · mangue-dev Jul 12 · 3 projects [Disconnect] ┐
 * ├ minddy can act on your behalf [Revoke] ┤
 *
 * Both lived in two separate maps, and it was necessary to reglue from head
 * “GitHub · mango-dev” from below with “GitHub — not yet authorized” from en
 * top. Under the same block, the question "which account are we talking about" does not arise
 * any more, and the hierarchy is readable: the connection CARRYS the authorization.
 *
 * Hence the tinted hover, which says the scope before the click: hover
 * "Disconnect" reddens the entire block (the connection leaves, and authorization
 * with); hovering over "Revoke" only reddens its line (only permission
 * jumps, connection remains). Keyboard focus does the same — the signal does not
 * only address the mouse.
 */

/** A forge account: its connection, its authorization, or one of both. */
interface AccountBlock {
  key: string;
  provider: RepoProviderId;
  /** Installation of the app / OAuth which gives access to the repositories. */
  connection: GitConnection | null;
  /** Authorization to act on your behalf on a pull request. */
  identity: GitIdentity | null;
}

/**
 * Joins the blocks. An identity is UNIQUE per provider (“MY git account”,
 * in the singular) while you can have several connections at the same forge
 * — one per organization where the app is installed. It therefore arises on the
 * connection of the SAME account, failing that on the first; without connection at all,
 * she holds her block alone (you can authorize her account without ever having
 * installed the app, when it is another member who linked the deposit).
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

  // Nothing yet: one line per forge deployed, to have where to authorize yourself.
  // As soon as a forge is used, we only talk about that one.
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
  // The git connection labels live in `Settings`: they are the same
  // words only in a project, and copying them here would cause them to diverge.
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

  // Callback return (?git=connected | ?git=error), set by
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
    // Remove callback params while keeping the tab.
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
        // Nothing to install: the connection already existed, it was just reassembled.
        void queryClient.invalidateQueries({ queryKey: gitConnectionsQueryKey });
      } else if (res.mode === "claim") {
        // Relay-only instance: the official App is claimed through the relay.
        // The interstitial polls until the claim resolves; it gets the claim
        // URL from its own poll, never from the query string.
        const params = new URLSearchParams({
          code: res.code,
          return: "/settings?tab=git",
        });
        window.location.href = `/connect/github?${params.toString()}`;
      } else {
        window.location.href = res.url; // page exit to the forge
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
      <AccountGitBranchPrefix />

      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountGitConnections}
        icon={GitBranch}
        title={t("gitConnectionsTitle")}
        description={t("gitConnectionsDesc")}
        help={t("gitConnectionsHelp")}
        variant="block"
        /* The gesture lives at the end of the title; without counting he goes down in the scene
 and is not shown twice. */
        action={
          connections.length > 0 && deployed.length > 0 ? connectMenu : undefined
        }
      >
        {/* The two requests decide the contents of the same block: wait for them both, otherwise the authorization line jumps from one state to the other in front of you. */}
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

function AccountGitBranchPrefix() {
  const t = useTranslations("Account");
  const tc = useTranslations("Common");
  const queryClient = useQueryClient();
  const { branchPrefix, loading } = useAgentPreferencesQuery();
  const [draft, setDraft] = useState(branchPrefix);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(branchPrefix), [branchPrefix]);

  const save = async () => {
    if (saving || draft.trim() === branchPrefix) return;
    setSaving(true);
    try {
      const saved = await saveAgentPreferencesApi({ branch_prefix: draft });
      setDraft(saved.branch_prefix);
      await queryClient.invalidateQueries({ queryKey: agentPreferencesQueryKey });
      toast.success(t("agentBranchPrefixSavedToast"));
    } catch (err) {
      setDraft(branchPrefix);
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.accountGitBranchPrefix}
      icon={GitBranch}
      title={t("gitAgentBranchesTitle")}
      description={t("gitAgentBranchesDesc")}
    >
      {loading ? (
        <SettingsEmpty>{tc("loading")}</SettingsEmpty>
      ) : (
        <SettingsRow
          label={t("agentBranchPrefixTitle")}
          hint={t("agentBranchPrefixDesc")}
          htmlFor="agent-branch-prefix"
          control={
            <div className="flex items-center gap-2">
              <Input
                id="agent-branch-prefix"
                className="w-44 font-mono"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void save();
                  }
                }}
                disabled={saving}
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving || draft.trim() === branchPrefix}
                onClick={() => void save()}
              >
                {saving ? t("agentBranchPrefixSaving") : t("agentBranchPrefixSave")}
              </Button>
            </div>
          }
        />
      )}
    </SettingsGroup>
  );
}

/**
 * An account, its two levels, and the scope of each gesture rendered BEFORE the
 * click: `danger` says which region the button hovered over would take.
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

  // The GitLab account IS the OAuth connection: revoking it here would unbind the
  // project repositories. This is done by “Disconnect”, the confirmation of which
  // carries the warning — so no second button on this line.
  const revocable = identity?.source === "identity";

  const status = identity
    ? identity.source === "connection"
      ? t("gitIdentityFromConnection")
      : t("gitIdentityAuthorized")
    : t("gitIdentityNotAuthorized");

  /** Hover AND focus: the signal is not only addressed to the mouse. */
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
            // Disconnect unbinds the repositories of all projects that are connected to them
            // served, and takes the authorization with it: the entire block blushes.
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
          // Only the authorization jumps: the color stops at this line.
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
