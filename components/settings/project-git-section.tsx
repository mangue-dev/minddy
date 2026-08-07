"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, ConfirmDeleteDialog, Spinner, Switch, toast } from "mangue-ui";
import { GitBranch, Github, Gitlab, Link2Off } from "lucide-react";
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
 * Section « Git » des paramètres du projet (MIN-47) : connecter un compte
 * GitHub/GitLab (au niveau compte, réutilisable) et lier un dépôt au projet.
 * La liaison alimente l'agent de code (MIN-46/MIN-69) et, quand le toggle est
 * activé, la synchro unidirectionnelle des issues du dépôt (MIN-97). Owner
 * uniquement pour muter ; les membres voient l'état en lecture seule.
 */
export function ProjectGitSection({ projectId }: { projectId: string }) {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { link, isOwner, providers, loading } = useProjectGitLinkQuery(projectId);

  const [connecting, setConnecting] = useState<RepoProviderId | null>(null);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateRepo[] | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [binding, setBinding] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  // Miroir local du toggle de synchro : il bascule tout de suite, puis se
  // réconcilie sur la liaison refetchée (pattern smart-assign-section).
  const [issueSync, setIssueSync] = useState(false);
  const [savingIssueSync, setSavingIssueSync] = useState(false);
  /** Posé par la réponse d'activation quand l'installation GitHub n'a accordé
      que `Issues (Read)` : le retour de statut vers la forge a besoin de
      `write`. Null = rien à signaler. */
  const [writeMissingUrl, setWriteMissingUrl] = useState<string | null>(null);
  useEffect(() => {
    setIssueSync(link?.issue_sync_enabled === true);
  }, [link?.issue_sync_enabled]);

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
    // Retire les params de callback en conservant l'onglet.
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
    // La liste des projets où l'agent peut travailler change avec ce lien : la
    // page Agents n'offre que ceux-là, et sans cette invalidation le projet qu'on
    // vient de lier n'y paraîtrait qu'après péremption du cache.
    void queryClient.invalidateQueries({ queryKey: GIT_LINKED_PROJECTS_KEY });
  }, [queryClient, projectId]);

  // Charge les dépôts candidats quand une connexion est active.
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
      } else {
        window.location.href = res.url; // redirection vers le provider
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
    setIssueSync(next); // optimiste — annulé en cas d'échec
    setSavingIssueSync(true);
    try {
      const { writeMissingUrl } = await setGitIssueSyncApi(
        projectId,
        next,
        link.provider,
      );
      toast.success(
        t(next ? "gitIssueSyncEnabledToast" : "gitIssueSyncDisabledToast"),
      );
      // L'installation n'a accordé que la LECTURE des issues : l'import marche,
      // mais refermer une issue depuis minddy demande `write`. On le dit une
      // fois, au moment où c'est actionnable — pas un bandeau permanent.
      setWriteMissingUrl(writeMissingUrl ?? null);
      // Le backfill tourne côté serveur après la réponse : on relit un peu plus
      // tard pour afficher sa date, en plus du refetch immédiat.
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

  /** Un seul cadre pour les six états : le groupe est toujours le même, seul
      son corps change. Avant, chaque branche rendait sa propre mise en page. */
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

  // ── Sélecteur de dépôt (connexion active) ─────────────────────────────────
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

  // ── Dépôt déjà lié ────────────────────────────────────────────────────────
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
                // Sous quel compte Numo agit sur la forge (MIN-146). GitHub a une
                // identité de bot (le token d'installation de l'App) : rien à dire.
                // GitLab n'en a pas — l'agent part de la connexion OAuth du LIEN,
                // donc du compte de qui a lié le dépôt. Tant qu'une identité de
                // service n'existe pas, on le DIT plutôt que de le laisser
                // découvrir dans l'historique du dépôt.
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

            {/* Synchro unidirectionnelle des issues du dépôt → minddy (MIN-97). */}
            <SettingsRow
              htmlFor="git-issue-sync"
              label={t("gitIssueSyncLabel", { provider: providerName })}
              hint={isOwner ? t("gitIssueSyncHint") : t("gitIssueSyncOwnerOnlyHint")}
              control={
                <Switch
                  id="git-issue-sync"
                  checked={issueSync}
                  onCheckedChange={(v) => void handleIssueSync(v)}
                  disabled={savingIssueSync || !isOwner}
                />
              }
            >
              {issueSync && (
                <p className="text-xs text-muted-foreground">
                  {t("gitIssueSyncScopeHint")}
                </p>
              )}
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

            {/* Ménage des branches d'agent des PR fermées (MIN-102) — owner seul :
                supprimer des branches distantes engage le dépôt, comme le déliement. */}
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

  // ── Aucun dépôt lié ───────────────────────────────────────────────────────
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
