"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, ConfirmDeleteDialog, Spinner, toast } from "mangue-ui";
import { Github, Gitlab, Link2Off } from "lucide-react";
import { ProviderConnectButtons } from "@/components/git/provider-connect-buttons";
import { SearchSelect } from "@/components/search-select";
import {
  bindGitRepoApi,
  fetchGitCandidatesApi,
  startGitConnectApi,
  unlinkGitRepoApi,
} from "@/lib/git-integration-api";
import {
  projectGitLinkQueryKey,
  useProjectGitLinkQuery,
} from "@/lib/use-project-git-link-query";
import { getRepoProvider, type RepoProviderId } from "@/lib/repo-providers";
import type { CandidateRepo } from "@/lib/types";

const PROVIDER_ICON = { github: Github, gitlab: Gitlab } as const;

/**
 * Section « Git » des paramètres du projet (MIN-47) : connecter un compte
 * GitHub/GitLab (au niveau compte, réutilisable) et lier un dépôt au projet.
 * INERTE : rien ne consomme encore la liaison. Owner uniquement pour muter ;
 * les membres voient l'état en lecture seule.
 */
export function ProjectGitSection({ projectId }: { projectId: string }) {
  const t = useTranslations("Settings");
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

  const handleUnlink = async () => {
    try {
      await unlinkGitRepoApi(projectId);
      toast.success(t("gitRepoUnlinkedToast"));
      invalidate();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading) {
    return <p className="py-2 text-sm text-muted-foreground">{t("gitLoading")}</p>;
  }

  // ── Sélecteur de dépôt (connexion active) ─────────────────────────────────
  if (activeConnectionId) {
    const options = (candidates ?? []).map((c) => ({
      value: c.external_repo_id,
      label: c.full_name,
    }));
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("gitPickRepoDesc")}</p>
        {candidatesLoading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Spinner /> {t("gitLoadingRepos")}
          </div>
        ) : options.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t("gitNoRepos")}</p>
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
      </div>
    );
  }

  // ── Dépôt déjà lié ────────────────────────────────────────────────────────
  if (link) {
    const Icon = PROVIDER_ICON[link.provider];
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {link.repo_full_name ?? link.external_repo_id}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {getRepoProvider(link.provider).displayName}
              {link.account_login ? ` · ${link.account_login}` : ""}
              {link.default_branch ? ` · ${link.default_branch}` : ""}
            </p>
          </div>
          {isOwner && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmUnlink(true)}
            >
              <Link2Off className="size-4" />
              {t("gitUnlink")}
            </Button>
          )}
        </div>
        <ConfirmDeleteDialog
          open={confirmUnlink}
          onOpenChange={setConfirmUnlink}
          title={t("gitUnlinkTitle")}
          description={t("gitUnlinkDescription")}
          confirmLabel={t("gitUnlink")}
          onConfirm={handleUnlink}
        />
      </div>
    );
  }

  // ── Aucun dépôt lié ───────────────────────────────────────────────────────
  if (!isOwner) {
    return (
      <p className="py-2 text-sm text-muted-foreground">{t("gitEmptyMember")}</p>
    );
  }

  const configuredIds = providers
    .filter((p) => p.configured)
    .map((p) => p.id);

  if (configuredIds.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">{t("gitNotConfigured")}</p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("gitEmptyOwner")}</p>
      <ProviderConnectButtons
        onConnect={handleConnect}
        connecting={connecting}
        only={configuredIds}
      />
    </div>
  );
}
