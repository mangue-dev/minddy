"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, ConfirmDeleteDialog, Spinner, Switch, toast } from "mangue-ui";
import { GitBranch, Link2Off } from "lucide-react";
import { Github, Gitlab } from "@/components/git/provider-icons";
import { ProviderConnectButtons } from "@/components/git/provider-connect-buttons";
import { GitBranchCleanup } from "@/components/settings/git-branch-cleanup";
import { SearchSelect } from "@/components/search-select";
import {
  bindGitRepoApi,
  fetchGitCandidatesApi,
  setGitIssueSyncApi,
  startGitConnectApi,
  unlinkGitRepoApi,
} from "@/lib/git-integration-api";
import {
  GIT_LINKED_PROJECTS_KEY,
  projectGitLinkQueryKey,
  useProjectGitLinkQuery,
} from "@/lib/use-project-git-link-query";
import { getRepoProvider, type RepoProviderId } from "@/lib/repo-providers";
import {
  SettingsEmpty,
  SettingsGroup,
  SettingsListRow,
  SettingsRow,
} from "@/components/settings/settings-ui";
import { EmptyScene } from "@/components/empty-scene";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import type { CandidateRepo } from "@/lib/types";

const PROVIDER_ICON = { github: Github, gitlab: Gitlab } as const;

/**
 * “Git” section of project settings (MIN-47): connect a account
 * GitHub/GitLab (at account level, reusable) and link a repository to the project.
 * The link powers the code agent (MIN-46/MIN-69) and, when the toggle is
 * activated, the unidirectional synchronization of depot exits (MIN-97). Owner
 * only to mutate; members see read-only status.
 */
export function ProjectGitSection({ projectId }: { projectId: string }) {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    link,
    isOwner,
    providers,
    writeMissingUrl: fetchedWriteMissingUrl,
    loading,
  } = useProjectGitLinkQuery(projectId);

  const [connecting, setConnecting] = useState<RepoProviderId | null>(null);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateRepo[] | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [binding, setBinding] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  // Local mirror of the sync toggle: it switches immediately, then
  // reconcile on the refetched link (pattern smart-assign-section).
  const [issueSync, setIssueSync] = useState(false);
  const [savingIssueSync, setSavingIssueSync] = useState(false);
  /** GitHub install only granted `Issues (Read)`: returning
 status to the forge needs `write`. Null = nothing to report.
 Same mirror as the toggle — the activation response immediately sets it to
, the following reading takes effect (and makes it DISAPPEAR as soon as the
 permission is granted on GitHub). */
  const [writeMissingUrl, setWriteMissingUrl] = useState<string | null>(null);
  useEffect(() => {
    setIssueSync(link?.issue_sync_enabled === true);
  }, [link?.issue_sync_enabled]);
  useEffect(() => {
    setWriteMissingUrl(fetchedWriteMissingUrl);
  }, [fetchedWriteMissingUrl]);

  // Retour de callback OAuth : ?git=connected&connection=<id> (ou git=error).
  const handledCallback = useRef(false);
  useEffect(() => {
    if (handledCallback.current) return;
    const status = searchParams.get("git");
    if (!status) return;
    handledCallback.current = true;
    if (status === "connected") {
      const connection = searchParams.get("connection");
      if (connection) setActiveConnectionId(connection);
      toast.success(t("gitConnectedToast"));
    } else if (status === "error") {
      toast.error(t("gitConnectError"));
    }
    // Remove callback params while keeping the tab.
    const next = new URLSearchParams(searchParams);
    next.delete("git");
    next.delete("connection");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, pathname, router, t]);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: projectGitLinkQueryKey(projectId),
    });
    // The list of projects where the agent can work changes with this link: the
    // Agents page only offers these, and without this invalidation the project that we
    // just linked would only appear after the cache expires.
    void queryClient.invalidateQueries({ queryKey: GIT_LINKED_PROJECTS_KEY });
  }, [queryClient, projectId]);

  // Load candidate repositories when a connection is active.
  useEffect(() => {
    if (!activeConnectionId) {
      setCandidates(null);
      return;
    }
    let cancelled = false;
    setCandidatesLoading(true);
    setCandidates(null);
    fetchGitCandidatesApi(projectId, activeConnectionId)
      .then((res) => {
        if (!cancelled) setCandidates(res.candidates);
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error((err as Error).message);
          setActiveConnectionId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setCandidatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeConnectionId, projectId]);

  const handleConnect = async (provider: RepoProviderId) => {
    setConnecting(provider);
    try {
      const res = await startGitConnectApi(projectId, provider);
      if (res.mode === "reuse") {
        setActiveConnectionId(res.connectionId);
      } else if (res.mode === "claim") {
        // Relay-only instance: the official App is claimed through the relay.
        // The interstitial polls until the claim resolves; it gets the claim
        // URL from its own poll, never from the query string.
        const params = new URLSearchParams({
          code: res.code,
          return: `/projects/${projectId}/settings?tab=git`,
        });
        window.location.href = `/connect/github?${params.toString()}`;
      } else {
        window.location.href = res.url; // redirection to the provider
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setConnecting(null);
    }
  };

  const handleBind = async (externalRepoId: string) => {
    if (!activeConnectionId) return;
    setBinding(true);
    try {
      await bindGitRepoApi(projectId, activeConnectionId, externalRepoId);
      toast.success(t("gitRepoLinkedToast"));
      setActiveConnectionId(null);
      invalidate();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBinding(false);
    }
  };

  const handleIssueSync = async (next: boolean) => {
    if (!link || !isOwner || savingIssueSync) return;
    setIssueSync(next); // optimistic — canceled on failure
    setSavingIssueSync(true);
    try {
      const response = await setGitIssueSyncApi(projectId, next, link.provider);
      toast.success(
        t(next ? "gitIssueSyncEnabledToast" : "gitIssueSyncDisabledToast"),
      );
      // The installation only granted READING of the outputs: the import works,
      // but closing an issue from minddy requests `write`. Asked everything
      // continuation so as not to wait for the refetch — which will confirm it.
      setWriteMissingUrl(response.writeMissingUrl ?? null);
      // The backfill runs on the server side after the response: we read a little more
      // late to display its date, in addition to immediate refetch.
      invalidate();
      if (next) setTimeout(invalidate, 4000);
    } catch (err) {
      setIssueSync(!next);
      toast.error((err as Error).message);
    } finally {
      setSavingIssueSync(false);
    }
  };

  const handleUnlink = async () => {
    try {
      await unlinkGitRepoApi(projectId);
      toast.success(t("gitRepoUnlinkedToast"));
      invalidate();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  /** A single frame for the six states: the group is always the same, only
 its body changes. Before, each branch rendered its own layout. */
  const group = (variant: "rows" | "block", children: ReactNode) => (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.projectGit}
      icon={GitBranch}
      title={t("gitTab")}
      description={t("gitSectionDesc")}
      variant={variant}
    >
      {children}
    </SettingsGroup>
  );

  if (loading) {
    return group("block", <SettingsEmpty className="py-0">{t("gitLoading")}</SettingsEmpty>);
  }

  // ── Repository selector (active connection) ─────────────────────────────────
  if (activeConnectionId) {
    const options = (candidates ?? []).map((c) => ({
      value: c.external_repo_id,
      label: c.full_name,
    }));
    return group(
      "block",
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("gitPickRepoDesc")}</p>
        {candidatesLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> {t("gitLoadingRepos")}
          </div>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("gitNoRepos")}</p>
        ) : (
          <SearchSelect
            value={null}
            onChange={(v) => v && handleBind(v)}
            options={options}
            searchPlaceholder={t("gitSearchRepo")}
            emptyText={t("gitNoRepos")}
            align="start"
            trigger={
              <Button variant="outline" disabled={binding} className="justify-start">
                {binding ? <Spinner /> : null}
                {t("gitChooseRepo")}
              </Button>
            }
          />
        )}
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveConnectionId(null)}
            disabled={binding}
          >
            {t("gitCancel")}
          </Button>
        </div>
      </div>,
    );
  }

  // ── Repository already linked ──────────────────────────── ────────────────────────────
  if (link) {
    const Icon = PROVIDER_ICON[link.provider];
    const providerName = getRepoProvider(link.provider).displayName;
    return (
      <>
        {group(
          "rows",
          <>
            <SettingsListRow
              avatar={
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <Icon className="size-4" />
                </span>
              }
              title={link.repo_full_name ?? link.external_repo_id}
              subtitle={
                providerName +
                (link.account_login ? ` · ${link.account_login}` : "") +
                (link.default_branch ? ` · ${link.default_branch}` : "") +
                // Under what account Numo acts on the forge (MIN-146). GitHub has a
                // bot identity (the App installation token): nothing to say.
                // GitLab doesn't have one — the agent starts from the LINK's OAuth connection,
                // therefore from the account of who linked the deposit. As long as an identity of
                // service does not exist, we SAY it rather than leaving it
                // discover in the repository history.
                (link.provider === "gitlab"
                  ? ` · ${
                      link.account_login
                        ? t("gitAgentActsAs", { login: link.account_login })
                        : t("gitAgentActsAsUnknown")
                    }`
                  : "")
              }
              truncateSubtitle={false}
              action={
                isOwner && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmUnlink(true)}
                  >
                    <Link2Off className="size-4" />
                    {t("gitUnlink")}
                  </Button>
                )
              }
            />

            {/* Synchronization of repository issues ↔ minddy (MIN-97). The row says what
 the switch does in one line; the detail — what is taken, what goes back, what does not go back — lives in the ⓘ,
 so that the page remains readable at a glance. */}
            <SettingsRow
              htmlFor="git-issue-sync"
              label={t("gitIssueSyncLabel", { provider: providerName })}
              hint={isOwner ? t("gitIssueSyncHint") : t("gitIssueSyncOwnerOnlyHint")}
              help={t("gitIssueSyncHelp")}
              control={
                <Switch
                  id="git-issue-sync"
                  checked={issueSync}
                  onCheckedChange={(v) => void handleIssueSync(v)}
                  disabled={savingIssueSync || !isOwner}
                />
              }
            >
              {issueSync && writeMissingUrl && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  <a
                    href={writeMissingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    {t("gitIssueSyncWriteMissing")}
                  </a>
                </p>
              )}
              {issueSync && link.issue_sync_backfilled_at && (
                <p className="text-xs text-muted-foreground">
                  {t("gitIssueSyncBackfilled", {
                    date: format.dateTime(new Date(link.issue_sync_backfilled_at), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                  })}
                </p>
              )}
            </SettingsRow>

            {/* Cleaning agent branches of closed PRs (MIN-102) — owner only:
 removing remote branches commits the repository, like unbinding. */}
            {isOwner && (
              <GitBranchCleanup projectId={projectId} provider={link.provider} />
            )}
          </>,
        )}

        <ConfirmDeleteDialog
          open={confirmUnlink}
          onOpenChange={setConfirmUnlink}
          title={t("gitUnlinkTitle")}
          description={t("gitUnlinkDescription")}
          confirmLabel={t("gitUnlink")}
          cancelLabel={tc("cancel")}
          onConfirm={handleUnlink}
        />
      </>
    );
  }

  // ── No linked repository ─────────────────────────── ────────────────────────────
  if (!isOwner) {
    return group(
      "block",
      <SettingsEmpty className="py-0">{t("gitEmptyMember")}</SettingsEmpty>,
    );
  }

  const configuredIds = providers
    .filter((p) => p.configured)
    .map((p) => p.id);

  if (configuredIds.length === 0) {
    return group(
      "block",
      <SettingsEmpty className="py-0">{t("gitNotConfigured")}</SettingsEmpty>,
    );
  }

  return group(
    "block",
    <EmptyScene size="compact" icon={GitBranch} title={t("gitEmptyOwner")}>
      <ProviderConnectButtons
        inline
        onConnect={handleConnect}
        connecting={connecting}
        only={configuredIds}
      />
    </EmptyScene>,
  );
}
