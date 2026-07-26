"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Button, Spinner, Switch, cn, toast } from "mangue-ui";
import { ArrowRight, Check } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCreate } from "@/lib/create-context";
import { useProjects } from "@/lib/projects-context";
import { GLOBAL_BOARD_KEY } from "@/lib/use-global-board-query";
import { HOME_SUMMARY_KEY } from "@/lib/use-home-summary-query";
import { CYCLES_ENABLED_META_KEY, resolveCyclePrefs } from "@/lib/cycle-prefs";
import type { OnboardingStepId } from "@/lib/onboarding";
import type { UseOnboardingResult } from "@/lib/use-onboarding";
import { McpConnectPanel } from "@/components/settings/mcp-connect-panel";

/**
 * Onboarding du nouveau compte (MIN-74). Il prend la place du corps de la home
 * tant qu'il n'est pas terminé : pour un compte neuf, les cartes cycle/global,
 * le feedback et la grille de projets n'ont de toute façon rien à montrer.
 *
 * À gauche les quatre étapes et leur état, à droite l'étape courante. Deux
 * étapes se cochent seules quand la donnée existe (projet, ticket) ; les deux
 * autres sont acquittées à la main — connecter un agent est une proposition,
 * jamais un prérequis. « Passer l'onboarding » reste visible en permanence.
 */

const MOTION = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };

/** Une ligne de la colonne de gauche : pastille d'état + titre. */
function StepRow({
  index,
  title,
  state,
}: {
  index: number;
  title: string;
  state: "completed" | "current" | "pending";
}) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <span
        aria-hidden
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium tabular-nums transition-colors",
          state === "completed" && "bg-brand/15 text-brand",
          state === "current" && "bg-foreground text-background",
          state === "pending" && "border border-border text-muted-foreground",
        )}
      >
        {state === "completed" ? <Check className="size-3" strokeWidth={3} /> : index}
      </span>
      <span
        className={cn(
          "min-w-0 truncate text-sm transition-colors",
          state === "current" ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {title}
      </span>
    </div>
  );
}

export function OnboardingCard({ onboarding }: { onboarding: UseOnboardingResult }) {
  const t = useTranslations("Onboarding");
  const queryClient = useQueryClient();
  const { user, updateUserMetadata } = useAuth();
  const { openCreateProject } = useProjects();
  const { openCreateIssue } = useCreate();

  const [busy, setBusy] = useState(false);

  const { steps, currentStepId, currentStepNumber, totalCount } = onboarding;

  const title: Record<OnboardingStepId, string> = {
    project: t("projectTitle"),
    issue: t("issueTitle"),
    mcp: t("mcpTitle"),
    cycles: t("cyclesTitle"),
  };
  const description: Record<OnboardingStepId, string> = {
    project: t("projectDesc"),
    issue: t("issueDesc"),
    mcp: t("mcpDesc"),
    cycles: t("cyclesDesc"),
  };

  /** Acquitte une étape ; la dernière ferme l'onboarding, d'où le mot de fin. */
  const acknowledge = async (step: OnboardingStepId, done = false) => {
    setBusy(true);
    try {
      await onboarding.acknowledgeStep(step);
      if (done) toast.success(t("doneToast"));
    } finally {
      setBusy(false);
    }
  };

  /** Activer les cycles coche l'étape 4 — donc termine l'onboarding. */
  const enableCycles = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await updateUserMetadata({ [CYCLES_ENABLED_META_KEY]: true });
      // Les deux lectures réconcilient la timeline des cycles (ensureCycles) :
      // le résumé, qui est ce que la home a sous les yeux, et le board agrégé.
      void queryClient.invalidateQueries({ queryKey: HOME_SUMMARY_KEY });
      void queryClient.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY });
      toast.success(t("doneToast"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // `currentStepId` est non-null tant que la carte est montée (la home ne la
  // rend que si `visible`), mais on reste défensif plutôt que d'assener un `!`.
  if (!currentStepId) return null;

  return (
    <div className="flex flex-col items-center gap-3">
      <section className="w-full rounded-xl border border-border bg-card p-5 text-card-foreground md:p-6">
        <div className="grid gap-6 md:grid-cols-[200px_1fr] md:gap-8">
          {/* Colonne gauche : où j'en suis. */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium tracking-tight text-muted-foreground">
              {t("stepIndicator", { current: currentStepNumber, total: totalCount })}
            </p>
            <ol className="flex flex-col">
              {steps.map((step, index) => (
                <li key={step.id}>
                  <StepRow
                    index={index + 1}
                    title={title[step.id]}
                    state={
                      step.completed
                        ? "completed"
                        : step.id === currentStepId
                          ? "current"
                          : "pending"
                    }
                  />
                </li>
              ))}
            </ol>
          </div>

          {/* Colonne droite : l'étape courante, et elle seule. */}
          <div className="min-w-0 md:border-l md:border-border md:pl-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={currentStepId}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={MOTION}
                className="flex min-w-0 flex-col gap-4"
              >
                <div className="flex flex-col gap-1.5">
                  <h2 className="text-base font-semibold tracking-tight">
                    {title[currentStepId]}
                  </h2>
                  <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                    {description[currentStepId]}
                  </p>
                </div>

                {currentStepId === "project" && (
                  <div>
                    <Button type="button" onClick={openCreateProject}>
                      {t("projectCta")}
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                  </div>
                )}

                {currentStepId === "issue" && (
                  <div>
                    <Button type="button" onClick={() => openCreateIssue()}>
                      {t("issueCta")}
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                  </div>
                )}

                {currentStepId === "mcp" && (
                  <>
                    <McpConnectPanel />
                    <div>
                      <Button
                        type="button"
                        onClick={() => void acknowledge("mcp")}
                        disabled={busy}
                      >
                        {busy && <Spinner />}
                        {t("mcpCta")}
                        {!busy && <ArrowRight data-icon="inline-end" />}
                      </Button>
                    </div>
                  </>
                )}

                {currentStepId === "cycles" && (
                  <>
                    <label className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
                      {/* Toujours décoché ici : cycles activés = étape franchie
                          = carte démontée. On lit quand même la préférence
                          réelle plutôt que de câbler `false` en dur. */}
                      <Switch
                        id="onboarding-cycles"
                        checked={resolveCyclePrefs(user?.user_metadata).enabled}
                        onCheckedChange={() => void enableCycles()}
                        disabled={busy || !user}
                      />
                      <span className="text-sm text-foreground">
                        {t("cyclesToggle")}
                      </span>
                    </label>
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void acknowledge("cycles", true)}
                        disabled={busy}
                      >
                        {busy && <Spinner />}
                        {t("cyclesCta")}
                      </Button>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="bg-transparent text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground hover:underline"
        onClick={() => void onboarding.dismiss()}
      >
        {t("skip")}
      </Button>
    </div>
  );
}
