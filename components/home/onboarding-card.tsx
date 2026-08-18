"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Spinner,
  Switch,
  toast,
} from "mangue-ui";
import { ArrowRight, FileUp, PartyPopper } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCreate } from "@/lib/create-context";
import { useProjects } from "@/lib/projects-context";
import { useAnalytics } from "@/lib/use-analytics";
import { useInvitationResponder } from "@/lib/use-invitations-query";
import { GLOBAL_BOARD_KEY } from "@/lib/use-global-board-query";
import { HOME_SUMMARY_KEY } from "@/lib/use-home-summary-query";
import { CYCLES_ENABLED_META_KEY, resolveCyclePrefs } from "@/lib/cycle-prefs";
import type { OnboardingStepId } from "@/lib/onboarding";
import type { UseOnboardingResult } from "@/lib/use-onboarding";
import { OnboardingStepRow } from "@/components/home/onboarding-step-row";
import { OnboardingMcpStep } from "@/components/home/onboarding-mcp-step";
import { OnboardingKeyStep } from "@/components/home/onboarding-key-step";
import { OnboardingImportDialog } from "@/components/home/onboarding-import-dialog";
import { OnboardingJoinDialog } from "@/components/home/onboarding-join-dialog";

/**
 * Onboarding of the new account (MIN-74), on the AutoKap boss: on the left the
 * four stages and their state, on the right the current one, and this alone. The title of
 * the step is not repeated on the right — the left column already holds it.
 *
 * It takes the place of the body of the house as long as it is not finished: for a
 * new account, cycle/global cards, feedback and project grid
 * have nothing to show anyway. Two steps are checked alone when the
 * data exists (project, ticket); the others are paid by hand —
 * importing your backlog and connecting an agent are suggestions, never
 * prerequisite. “Skip onboarding” remains permanently visible, under
 * confirmation: it is irreversible.
 */

const MOTION = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };

export function OnboardingCard({ onboarding }: { onboarding: UseOnboardingResult }) {
  const t = useTranslations("Onboarding");
  const queryClient = useQueryClient();
  const { user, updateUserMetadata } = useAuth();
  const { openCreateProject } = useProjects();
  const { openCreateIssue } = useCreate();
  const { track } = useAnalytics();
  // A pending invitation changes step 1: we no longer have to explain
  // how to get invited, all you have to do is enter. Most recent first —
  // the API returns them sorted; the others remain in the banner and the inbox.
  const {
    invitations,
    busyId: invitationBusyId,
    answer: answerInvitation,
  } = useInvitationResponder();
  const invitation = invitations[0] ?? null;

  const [busy, setBusy] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);

  const { steps, currentStepId, currentStepNumber, totalCount, finalScreen } = onboarding;

  const title: Record<OnboardingStepId, string> = {
    project: t("projectTitle"),
    tickets: t("ticketsTitle"),
    mcp: t("mcpTitle"),
    key: t("keyTitle"),
    cycles: t("cyclesTitle"),
  };
  const description: Record<OnboardingStepId, string> = {
    project: t("projectDesc"),
    tickets: t("ticketsDesc"),
    mcp: t("mcpDesc"),
    key: t("keyDesc"),
    cycles: t("cyclesDesc"),
  };

  /** Acknowledges a step; the last one closes onboarding, hence the final word. */
  const acknowledge = async (step: OnboardingStepId) => {
    setBusy(true);
    try {
      await onboarding.acknowledgeStep(step);
    } finally {
      setBusy(false);
    }
  };

  /** Activating cycles checks the last step — therefore completes onboarding. */
  const enableCycles = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await updateUserMetadata({ [CYCLES_ENABLED_META_KEY]: true });
      // The two readings reconcile the cycle timeline (ensureCycles):
      // the summary, which is what the home has in front of them, and the aggregated board.
      void queryClient.invalidateQueries({ queryKey: HOME_SUMMARY_KEY });
      void queryClient.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openImport = (file: File | null = null) => {
    setDroppedFile(file);
    setImportOpen(true);
  };

  const openJoin = () => {
    // The account that clicks here does not have its own project: this is the only place
    // of the product that says it, and the activation funnel needs to know it.
    track("onboarding_join_opened");
    setJoinOpen(true);
  };

  /**
   * DEPOSIT ON THE WHOLE CARD, during the ticket stage. We arrive with a
   * CSV at hand, not with the desire to open a dialog first: the file
   * dropped anywhere on the onboarding opens the import, already loaded.
   *
   * `dragenter`/`dragleave` also triggers when crossing children —
   * hence the counter, otherwise the hover would blink.
   */
  const dropTarget = currentStepId === "tickets" && !finalScreen;
  const dragDepth = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

  const dragHandlers = dropTarget
    ? {
        onDragEnter: (e: React.DragEvent) => {
          if (!hasFiles(e)) return;
          dragDepth.current += 1;
          setDragOver(true);
        },
        onDragOver: (e: React.DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
        },
        onDragLeave: () => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragOver(false);
        },
        onDrop: (e: React.DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) openImport(file);
        },
      }
    : {};

  // `currentStepId` is non-null as long as the steps scroll; on the word of
  // At the end it is worth null and that is precisely what we return.
  if (!currentStepId && !finalScreen) return null;

  return (
    <div className="flex flex-col items-center gap-3">
      <section
        {...dragHandlers}
        className="relative w-full rounded-2xl border border-border bg-card p-2.5 text-card-foreground md:p-3.5"
      >
        <div className="grid gap-3 md:grid-cols-[280px_1fr] md:gap-5">
          {/* Left column: where I am. */}
          <div className="flex flex-col gap-3">
            <p className="pr-1 text-right text-sm text-muted-foreground">
              {finalScreen
                ? t("stepIndicatorDone")
                : t("stepIndicator", { current: currentStepNumber, total: totalCount })}
            </p>
            <ol className="flex flex-col gap-2">
              {steps.map((step, index) => (
                <li key={step.id}>
                  <OnboardingStepRow
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

          {/* Right column: the current step, and this alone. */}
          <div className="flex min-w-0 flex-col items-center justify-center gap-4 md:px-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={currentStepId ?? "final"}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={MOTION}
                className="flex w-full min-w-0 flex-col items-center gap-4"
              >
                {finalScreen ? (
                  <div className="flex w-full max-w-md flex-col items-center gap-4 py-2">
                    <PartyPopper className="size-6 text-brand" aria-hidden />
                    <p className="text-center text-sm font-medium text-foreground">
                      {t("finalTitle")}
                    </p>
                    <div className="w-full rounded-lg bg-muted/60 px-4 py-3 text-center text-sm leading-relaxed text-foreground/80">
                      {t("finalHint")}
                    </div>
                    <Button type="button" onClick={() => void onboarding.finish()}>
                      {t("finalCta")}
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="w-full text-left text-sm leading-relaxed text-foreground">
                      {description[currentStepId!]}
                    </p>

                    {currentStepId === "project" && (
                      <div className="flex w-full flex-wrap items-center gap-2">
                        <Button type="button" onClick={openCreateProject}>
                          {t("projectCta")}
                          <ArrowRight data-icon="inline-end" />
                        </Button>
                        {/* Guest: the button names the project and enters it
 with one click, instead of opening the instructions for
 the invitation that we have already received. */}
                        {invitation ? (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={invitationBusyId === invitation.id}
                            onClick={() =>
                              void answerInvitation(invitation.id, "accept")
                            }
                          >
                            {invitationBusyId === invitation.id && <Spinner />}
                            {t("joinProjectCta", { project: invitation.project_name })}
                          </Button>
                        ) : (
                          <Button type="button" variant="outline" onClick={openJoin}>
                            {t("joinCta")}
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Two paths to the same stage, and it ticks off
 anyway on its own as soon as a ticket exists: the one
 that we have just created, or the hundred that we have just
 imported. */}
                    {currentStepId === "tickets" && (
                      <div className="flex w-full flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" onClick={() => openCreateIssue()}>
                            {t("ticketsCreateCta")}
                            <ArrowRight data-icon="inline-end" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => openImport()}
                          >
                            {t("ticketsImportCta")}
                          </Button>
                        </div>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <FileUp className="size-3.5 shrink-0" aria-hidden />
                          {t("ticketsDropHint")}
                        </p>
                      </div>
                    )}

                    {currentStepId === "mcp" && (
                      <OnboardingMcpStep
                        onDone={() => void acknowledge("mcp")}
                        onSkip={() => void acknowledge("mcp")}
                        busy={busy}
                      />
                    )}

                    {/* The step is ticked alone anyway as soon as a key
 exists; Acknowledging it immediately avoids waiting for the
 refetch. */}
                    {currentStepId === "key" && (
                      <OnboardingKeyStep
                        onDone={() => void acknowledge("key")}
                        onSkip={() => void acknowledge("key")}
                        busy={busy}
                      />
                    )}

                    {currentStepId === "cycles" && (
                      <div className="flex w-full flex-col gap-4">
                        <label className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
                          {/* Always unchecked here: cycles enabled = step
 crossed. We still read the real preference
 rather than hard-wiring `false`. */}
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
                            onClick={() => void acknowledge("cycles")}
                            disabled={busy}
                          >
                            {busy && <Spinner />}
                            {t("cyclesCta")}
                          </Button>
                        </div>
                      </div>
                    )}

                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Deposition veil: above the entire map, transparent to
 events so that the container's `drop` remains reachable. */}
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand bg-card/95 backdrop-blur-sm">
            <FileUp className="size-6 text-brand" aria-hidden />
            <p className="text-sm font-medium text-foreground">{t("ticketsDropOverlay")}</p>
          </div>
        )}
      </section>

      {!finalScreen && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="bg-transparent text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground hover:underline"
          onClick={() => setConfirmSkip(true)}
        >
          {t("skip")}
        </Button>
      )}

      <AlertDialog open={confirmSkip} onOpenChange={setConfirmSkip}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("skipConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("skipConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("skipConfirmCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onboarding.dismiss()}>
              {t("skipConfirmCta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <OnboardingJoinDialog open={joinOpen} onOpenChange={setJoinOpen} />

      <OnboardingImportDialog
        open={importOpen}
        onOpenChange={(next) => {
          setImportOpen(next);
          if (!next) setDroppedFile(null);
        }}
        initialFile={droppedFile}
        onImported={() => {
          setImportOpen(false);
          setDroppedFile(null);
          // The step will be checked on its own at the next summary (tickets exist);
          // Acknowledging it immediately avoids having to wait for the round trip.
          void acknowledge("tickets");
        }}
      />
    </div>
  );
}
