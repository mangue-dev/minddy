"use client";

import { useState } from "react";
import { useNow, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Spinner, toast } from "mangue-ui";
import { OctagonX, PauseCircle, Timer, Workflow } from "lucide-react";
import { postIssueAutomationApi } from "@/lib/agent-api";
import { issueChainQueryKey, useIssueChainQuery } from "@/lib/use-agent-runs";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * The status bar of an automation chain on a ticket (MIN-147): where
 * she is, and the only two gestures a human has on her — continue,
 * Stop. No spending gauge: a channel no longer has its own ceiling, it
 * don't interrupt there (see the lib/automations header). What she has
 * cost is said at the end, in his report commentary.
 *
 * It moves ALONE: the query that feeds it does not pollute, it is the trigger
 * realtime on `agent_chains` which invalidates it (see lib/realtime-provider.tsx).
 * This is the only surface of the product where expiration is certain — a chain
 * moves forward for several minutes without anyone touching anything.
 */

const STATUS_KEYS = {
  pending: "chainPending",
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
  const [busy, setBusy] = useState<"resume" | "start" | "stop" | null>(null);
  // The countdown to a reprieve refreshes itself: without a clock, it
  // would display "in 5 min" until booting, and would give the impression that
  // nothing moves. The minute is the right granularity (the sweeper switches to 2).
  const now = useNow({ updateInterval: 30_000 });

  // Nothing to say when no channel has ever been turned, nor once it is
  // finished: a “finished” headband that no longer goes away is permanent noise.
  //
  // Nor when she stopped WITHOUT having played the slightest step: it is the
  // reprieve canceled — because we copied the prompt, moved the ticket, launched
  // Number in hand. Nothing turned out, nothing was spent, and let
  // “Automation stopped” permanently on a ticket that we have just taken into account
  // hand would announce an incident where there was only an ordinary gesture.
  if (!chain || chain.status === "completed") return null;
  if (chain.status === "stopped" && chain.step === 0) return null;

  const act = async (action: "resume" | "start" | "stop") => {
    setBusy(action);
    try {
      await postIssueAutomationApi(issueId, action);
      await queryClient.invalidateQueries({ queryKey: issueChainQueryKey(issueId) });
      toast.success(
        t(action === "stop" ? "stopped" : action === "start" ? "started" : "resumed"),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const pending = chain.status === "pending";
  const live = pending || chain.status === "running" || chain.status === "awaiting_human";
  const Icon = pending
    ? Timer
    : chain.status === "awaiting_human"
      ? PauseCircle
      : chain.status === "running"
        ? Workflow
        : OctagonX;

  // Minutes remaining on reprieve, never less than one: “in 0 min” reads
  // like a bug while the sweeper simply passes within two minutes.
  const minutesLeft =
    pending && chain.notBefore
      ? Math.max(1, Math.ceil((Date.parse(chain.notBefore) - now.getTime()) / 60_000))
      : 0;

  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm">
          {pending
            ? t("chainPending", { minutes: minutesLeft })
            : t(STATUS_KEYS[chain.status], { step: chain.step })}
        </p>
        {live && (
          <div className="flex shrink-0 items-center gap-1">
            {pending && (
              <Button
                type="button"
                size="sm"
                disabled={busy !== null}
                onClick={() => void act("start")}
              >
                {busy === "start" && <Spinner />}
                {t("startNow")}
              </Button>
            )}
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
              {/* A channel that has not started CANCELS; one that turns
 STOPS. The same button, two different gestures. */}
              {pending ? t("cancel") : t("stop")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
