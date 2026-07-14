"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Spinner, toast } from "mangue-ui";
import { ExternalLink } from "lucide-react";
import { useAgentRunPrQuery } from "@/lib/use-agent-runs";
import { actOnAgentPrApi } from "@/lib/agent-api";
import { PrDiff } from "@/components/pull-requests/pr-diff";

/**
 * Review in-app de la PR d'un run (MIN-46) : diff par fichier (via <PrDiff>),
 * boutons Merge / Close, lien GitHub. Alimentée par /api/agent-runs/[runId]/pr.
 * Le rendu du diff est mutualisé avec la page Pull Requests (MIN-66).
 */
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

      <div className="max-h-96 overflow-auto">
        <PrDiff files={files} prUrl={pr.url} />
      </div>
    </div>
  );
}
