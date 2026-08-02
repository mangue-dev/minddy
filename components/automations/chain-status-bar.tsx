"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Progress, Spinner, toast } from "mangue-ui";
import { OctagonX, PauseCircle, Workflow } from "lucide-react";
import { postIssueAutomationApi } from "@/lib/agent-api";
import { issueChainQueryKey, useIssueChainQuery } from "@/lib/use-agent-runs";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * La barre d'état d'une chaîne d'automatisation sur un ticket (MIN-147) : où
 * elle en est, ce qu'elle a consommé de son plafond, et les deux seuls gestes
 * qu'un humain a sur elle — continuer, arrêter.
 *
 * Elle bouge SEULE : la query qui la nourrit ne poll pas, c'est le trigger
 * realtime sur `agent_chains` qui l'invalide (cf. lib/realtime-provider.tsx).
 * C'est la seule surface du produit où la péremption est certaine — une chaîne
 * avance pendant plusieurs minutes sans que personne ne touche à rien.
 */

const STATUS_KEYS = {
  running: "chainRunning",
  awaiting_human: "chainAwaiting",
  stopped: "chainStopped",
  completed: "chainCompleted",
  failed: "chainFailed",
} as const satisfies Record<string, MessageKey<"Automations">>;

export function ChainStatusBar({ issueId }: { issueId: string }) {
  const t = useTranslations("Automations");
  const queryClient = useQueryClient();
  const { chain } = useIssueChainQuery(issueId);
  const [busy, setBusy] = useState<"resume" | "stop" | null>(null);

  // Rien à dire quand aucune chaîne n'a jamais tourné, ni une fois qu'elle est
  // finie : un bandeau « terminé » qui ne part plus est du bruit permanent.
  if (!chain || chain.status === "completed") return null;

  const act = async (action: "resume" | "stop") => {
    setBusy(action);
    try {
      await postIssueAutomationApi(issueId, action);
      await queryClient.invalidateQueries({ queryKey: issueChainQueryKey(issueId) });
      toast.success(t(action === "resume" ? "resumed" : "stopped"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const live = chain.status === "running" || chain.status === "awaiting_human";
  const Icon =
    chain.status === "awaiting_human"
      ? PauseCircle
      : chain.status === "running"
        ? Workflow
        : OctagonX;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm">
          {t(STATUS_KEYS[chain.status], { step: chain.step })}
        </p>
        {live && (
          <div className="flex shrink-0 items-center gap-1">
            {chain.status === "awaiting_human" && (
              <Button
                type="button"
                size="sm"
                disabled={busy !== null}
                onClick={() => void act("resume")}
              >
                {busy === "resume" && <Spinner />}
                {t("resume")}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void act("stop")}
            >
              {busy === "stop" && <Spinner />}
              {t("stop")}
            </Button>
          </div>
        )}
      </div>

      {/* Le plafond, en PART consommée — jamais en dollars. */}
      {chain.budgetUsed !== null && (
        <div className="flex items-center gap-2">
          <Progress value={Math.round(chain.budgetUsed * 100)} className="h-1.5 flex-1" />
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("chainBudget", { percent: `${Math.round(chain.budgetUsed * 100)} %` })}
          </span>
        </div>
      )}
    </div>
  );
}
