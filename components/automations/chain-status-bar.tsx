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
 * La barre d'état d'une chaîne d'automatisation sur un ticket (MIN-147) : où
 * elle en est, et les deux seuls gestes qu'un humain a sur elle — continuer,
 * arrêter. Pas de jauge de dépense : une chaîne n'a plus de plafond propre, elle
 * ne s'interrompt pas là-dessus (cf. l'en-tête de lib/automations). Ce qu'elle a
 * coûté se dit à la fin, dans son commentaire de rapport.
 *
 * Elle bouge SEULE : la query qui la nourrit ne poll pas, c'est le trigger
 * realtime sur `agent_chains` qui l'invalide (cf. lib/realtime-provider.tsx).
 * C'est la seule surface du produit où la péremption est certaine — une chaîne
 * avance pendant plusieurs minutes sans que personne ne touche à rien.
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
  // Le compte à rebours d'un sursis se rafraîchit tout seul : sans horloge, il
  // afficherait « dans 5 min » jusqu'au démarrage, et donnerait l'impression que
  // rien ne bouge. La minute est la bonne granularité (le balayeur passe aux 2).
  const now = useNow({ updateInterval: 30_000 });

  // Rien à dire quand aucune chaîne n'a jamais tourné, ni une fois qu'elle est
  // finie : un bandeau « terminé » qui ne part plus est du bruit permanent.
  //
  // Ni quand elle s'est arrêtée SANS avoir joué la moindre étape : c'est le
  // sursis annulé — parce qu'on a copié le prompt, déplacé le ticket, lancé
  // Numo à la main. Rien n'a tourné, rien n'a été dépensé, et laisser
  // « Automatisation arrêtée » à demeure sur un ticket qu'on vient de prendre en
  // main annoncerait un incident là où il n'y a eu qu'un geste ordinaire.
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

  // Minutes restantes du sursis, jamais moins d'une : « dans 0 min » se lit
  // comme un bug alors que le balayeur passe simplement dans les deux minutes.
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
              {/* Une chaîne qui n'a pas démarré s'ANNULE ; une qui tourne
                  s'ARRÊTE. Le même bouton, deux gestes différents. */}
              {pending ? t("cancel") : t("stop")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
