"use client";

import "react-diff-view/style/index.css";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Spinner, toast } from "mangue-ui";
import { ExternalLink } from "lucide-react";
import { parseDiff, Diff, Hunk, type DiffType } from "react-diff-view";
import { useAgentRunPrQuery } from "@/lib/use-agent-runs";
import { actOnAgentPrApi, type PullRequestFile } from "@/lib/agent-api";

/**
 * Review in-app de la PR d'un run (MIN-46) : diff par fichier (react-diff-view),
 * boutons Merge / Close, lien GitHub. Alimentée par /api/agent-runs/[runId]/pr.
 */

/** Reconstruit un diff unifié complet à partir du patch par-fichier de l'API GitHub. */
function toUnifiedDiff(f: PullRequestFile): string {
  if (!f.patch) return "";
  const oldPath = f.status === "added" ? "/dev/null" : `a/${f.filename}`;
  const newPath = f.status === "removed" ? "/dev/null" : `b/${f.filename}`;
  return `diff --git a/${f.filename} b/${f.filename}\n--- ${oldPath}\n+++ ${newPath}\n${f.patch}\n`;
}

export function PrReview({ runId }: { runId: string }) {
  const t = useTranslations("Agent");
  const { pr, files, loading, refetch } = useAgentRunPrQuery(runId, true);
  const [acting, setActing] = useState<null | "merge" | "close">(null);

  const act = async (action: "merge" | "close") => {
    if (acting) return;
    setActing(action);
    try {
      await actOnAgentPrApi(runId, action);
      toast.success(action === "merge" ? t("prMergedToast") : t("prClosedToast"));
      await refetch();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setActing(null);
    }
  };

  if (loading) return <p className="text-xs text-muted-foreground">{t("prLoading")}</p>;
  if (!pr) return null;

  const diffText = files.map(toUnifiedDiff).filter(Boolean).join("\n");
  const parsed = diffText ? parseDiff(diffText) : [];
  const isTerminal = pr.merged || pr.state === "closed";
  const stateKey = pr.merged ? "prMerged" : pr.state === "closed" ? "prClosed" : "prOpen";

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2">
      <div className="flex items-center justify-between gap-2">
        <a
          href={pr.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-w-0 items-center gap-1 truncate text-xs font-medium text-brand hover:underline"
        >
          <ExternalLink className="size-3 shrink-0" />
          {t(stateKey)} #{pr.number}
        </a>
        {!isTerminal ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void act("close")}
              disabled={!!acting}
            >
              {acting === "close" ? <Spinner /> : null}
              {t("prClose")}
            </Button>
            <Button type="button" size="sm" onClick={() => void act("merge")} disabled={!!acting}>
              {acting === "merge" ? <Spinner /> : null}
              {t("prMerge")}
            </Button>
          </div>
        ) : null}
      </div>

      {parsed.length > 0 ? (
        <div className="max-h-96 overflow-auto rounded-md border border-border text-xs">
          {parsed.map((file, i) => {
            const path = file.newPath !== "/dev/null" ? file.newPath : file.oldPath;
            return (
              <div key={`${path}-${i}`}>
                <div className="sticky top-0 z-10 bg-muted px-2 py-1 font-mono text-[11px]">
                  {path}
                </div>
                <Diff viewType="unified" diffType={file.type as DiffType} hunks={file.hunks}>
                  {(hunks) => hunks.map((h) => <Hunk key={h.content} hunk={h} />)}
                </Diff>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("prNoDiff")}</p>
      )}
    </div>
  );
}
