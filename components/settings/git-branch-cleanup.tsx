"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  toast,
} from "mangue-ui";
import { AlertTriangle, Brush, ExternalLink } from "lucide-react";

import {
  deleteStaleBranchesApi,
  fetchStaleBranchesApi,
} from "@/lib/git-integration-api";
import type { RepoProviderId } from "@/lib/repo-providers";
import type { StaleBranch } from "@/lib/types";

/**
 * Ménage des branches d'agent (MIN-102) : les branches poussées par un run dont
 * la pull request est fermée.
 *
 * Deux portes d'entrée, un seul dialogue : le bouton de la section Git des
 * paramètres du projet (`GitBranchCleanup`), et la command palette, qui monte
 * `BranchCleanupDialog` directement depuis l'app shell. D'où le dialogue
 * CONTRÔLÉ, qui charge son aperçu à l'ouverture au lieu de le recevoir.
 *
 * Pré-cochage : les branches de PR FUSIONNÉES seulement. Une PR refusée porte du
 * travail qui n'existe nulle part ailleurs, et l'agent sait repartir de sa
 * branche pour rouvrir la PR — supprimer celle-là est une décision, pas un
 * défaut. Rien ne part au premier clic : le pied du dialogue demande une
 * confirmation explicite.
 */
export function BranchCleanupDialog({
  projectId,
  provider,
  open,
  onOpenChange,
}: {
  projectId: string;
  provider: RepoProviderId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Settings");

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [branches, setBranches] = useState<StaleBranch[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [truncated, setTruncated] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /** Échecs de la dernière suppression, affichés en place sous leur branche. */
  const [failures, setFailures] = useState<Record<string, string>>({});

  // L'aperçu est rechargé À CHAQUE ouverture : entre deux ménages, des PR se
  // ferment et des branches disparaissent — un cache mentirait vite.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setFailures({});
    setConfirming(false);
    fetchStaleBranchesApi(projectId)
      .then((res) => {
        if (cancelled) return;
        setBranches(res.branches);
        setTruncated(res.truncated);
        setSelected(
          new Set(
            res.branches.filter((b) => b.prState === "merged").map((b) => b.branch),
          ),
        );
      })
      .catch((err) => {
        if (!cancelled) setLoadError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  const toggle = useCallback((branch: string, next: boolean) => {
    setSelected((prev) => {
      const set = new Set(prev);
      if (next) set.add(branch);
      else set.delete(branch);
      return set;
    });
  }, []);

  const handleDelete = async () => {
    if (selected.size === 0) {
      toast.error(t("gitCleanBranchesNoSelection"));
      return;
    }
    setDeleting(true);
    try {
      const { results } = await deleteStaleBranchesApi(
        projectId,
        [...selected],
        provider,
      );
      const ok = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);

      // Les réussites quittent la liste ; les échecs y restent, avec leur cause.
      const gone = new Set(ok.map((r) => r.branch));
      setBranches((prev) => prev.filter((b) => !gone.has(b.branch)));
      setSelected((prev) => new Set([...prev].filter((b) => !gone.has(b))));
      setFailures(Object.fromEntries(failed.map((r) => [r.branch, r.error ?? ""])));
      setConfirming(false);

      if (failed.length === 0) {
        toast.success(t("gitCleanBranchesDoneToast", { count: ok.length }));
        onOpenChange(false);
      } else {
        toast.error(
          t("gitCleanBranchesPartialToast", {
            deleted: ok.length,
            failed: failed.length,
          }),
        );
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const hasRejectedSelected = branches.some(
    (b) => b.prState === "closed" && selected.has(b.branch),
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !deleting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("gitCleanBranchesTitle")}</DialogTitle>
          <DialogDescription>{t("gitCleanBranchesHint")}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Spinner /> {t("gitLoading")}
          </div>
        ) : loadError ? (
          <p className="py-4 text-sm text-destructive">{loadError}</p>
        ) : branches.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {t("gitCleanBranchesEmpty")}
          </p>
        ) : (
          <div className="-mx-1 max-h-80 overflow-y-auto px-1">
            <div className="flex flex-col gap-1">
              {branches.map((b) => (
                <div key={b.branch} className="flex flex-col gap-1">
                  <label className="flex items-start gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-muted/50">
                    <Checkbox
                      className="mt-0.5"
                      checked={selected.has(b.branch)}
                      disabled={deleting}
                      onCheckedChange={(next) => toggle(b.branch, next === true)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-xs">
                        {b.branch}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge
                          variant={b.prState === "merged" ? "secondary" : "outline"}
                          className="h-5"
                        >
                          {t(
                            b.prState === "merged"
                              ? "gitCleanBranchesMerged"
                              : "gitCleanBranchesRejected",
                          )}
                        </Badge>
                        {b.issue ? <span>{b.issue.identifier}</span> : null}
                        <a
                          href={b.prUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          #{b.prNumber}
                          <ExternalLink className="size-3" />
                        </a>
                      </span>
                    </span>
                  </label>
                  {failures[b.branch] !== undefined && (
                    <p className="px-1.5 pb-1 text-xs text-destructive">
                      {failures[b.branch] || t("gitCleanBranchesFailed")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {truncated && !loading && !loadError && (
          <p className="text-xs text-muted-foreground">
            {t("gitCleanBranchesTruncated")}
          </p>
        )}

        {hasRejectedSelected && (
          <p className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-2.5 text-xs text-muted-foreground">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            {t("gitCleanBranchesRejectedWarning")}
          </p>
        )}

        {branches.length > 0 && !loading && (
          <DialogFooter>
            {confirming ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={deleting}
                  onClick={() => setConfirming(false)}
                >
                  {t("gitCancel")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleting}
                  onClick={() => void handleDelete()}
                >
                  {deleting && <Spinner />}
                  {t("gitCleanBranchesConfirm")}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="destructive"
                disabled={selected.size === 0}
                onClick={() => setConfirming(true)}
              >
                {t("gitCleanBranchesDelete", { count: selected.size })}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** L'entrée de la section Git des paramètres du projet : bouton + dialogue. */
export function GitBranchCleanup({
  projectId,
  provider,
}: {
  projectId: string;
  provider: RepoProviderId;
}) {
  const t = useTranslations("Settings");
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Brush className="size-4" />
            {t("gitCleanBranches")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("gitCleanBranchesHint")}</p>
      </div>

      <BranchCleanupDialog
        projectId={projectId}
        provider={provider}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
