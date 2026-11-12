"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTitle } from "@/components/ui/sheet";
import { MobileSheetContent, MobileSheetScrollArea } from "@/components/ui/mobile-sheet";
import { Spinner } from "@/components/ui/spinner";
import { AUTH_SUBMIT_CLASS } from "@/components/auth/auth-chrome";
import { ConfettiBurst } from "@/components/first-run/confetti-burst";
import { FirstRunLayer } from "@/components/first-run/first-run-layer";
import { ProfileSetupScreen } from "@/components/first-run/profile-setup-screen";
import { OnboardingJoinDialog } from "@/components/home/onboarding-join-dialog";
import { McpConnectPanel } from "@/components/settings/mcp-connect-panel";
import { useAssistantPanelActions } from "@/lib/assistant-panel-context";
import { useCreate } from "@/lib/create-context";
import type { OnboardingStepId } from "@/lib/onboarding";
import { useProjects } from "@/lib/projects-context";
import { useInvitationResponder } from "@/lib/use-invitations-query";
import { useOnboardingChecklist } from "@/lib/use-onboarding";
import { cn } from "@/lib/utils";

/**
 * The getting-started steps on a phone (MIN-907): the desktop sidebar's
 * checklist, as a full-screen page that shows one step at a time. Each step's
 * action opens the same sheet the app uses (a project, an issue, Numo, the
 * agent connection) over this page, never a navigation; the step completes
 * from what was created, as on desktop. Every step can be skipped, and so can
 * the whole tour.
 */
export function MobileOnboardingScreen() {
  const t = useTranslations("Onboarding");
  const tCommon = useTranslations("Common");
  const onboarding = useOnboardingChecklist();
  const { projects, openCreateProject } = useProjects();
  const { openCreateIssue } = useCreate();
  const { open: openAssistant } = useAssistantPanelActions();
  const { invitations, busyId, answer } = useInvitationResponder();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<OnboardingStepId, string> = {
    project: t("projectTitle"), tickets: t("ticketsTitle"), numo: t("numoTitle"),
    mcp: t("mcpTitle"),
  };
  const descriptions: Record<OnboardingStepId, string> = {
    project: t("projectDesc"), tickets: t("ticketsDesc"), numo: t("numoDesc"),
    mcp: t("mcpDesc"),
  };

  /**
   * The step on screen: the first one left to do, unless the person went
   * back to an earlier one. Before the first step, back is the profile
   * screen, which belongs to the tour on a phone.
   */
  const [viewing, setViewing] = useState<OnboardingStepId | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const step = viewing ?? onboarding.currentStepId;
  const stepIndex = step ? onboarding.steps.findIndex((item) => item.id === step) : -1;
  const invitation = invitations[0];

  const goBack = () => {
    if (stepIndex <= 0) {
      setEditingProfile(true);
      return;
    }
    setViewing(onboarding.steps[stepIndex - 1].id);
  };

  const skipStep = () => {
    if (!step) return;
    const current = onboarding.steps[stepIndex];
    // A step already done or skipped: just move on to the next one, back to
    // the first one left once it is reached.
    if (current?.completed) {
      const next = onboarding.steps.slice(stepIndex + 1).find((item) => !item.completed || item.id === onboarding.currentStepId);
      setViewing(next && next.id !== onboarding.currentStepId ? next.id : null);
      return;
    }
    setViewing(null);
    void run(() => onboarding.acknowledgeStep(step));
  };

  const progress = (
    <ol className="flex justify-center gap-1.5" aria-label={t("progress", { done: onboarding.completedCount, total: onboarding.totalCount })}>
      {onboarding.steps.map((item) => (
        <li
          key={item.id}
          aria-hidden
          className={cn(
            "h-1.5 rounded-full transition-all",
            item.id === step ? "w-6 bg-primary" : item.completed ? "w-1.5 bg-primary/60" : "w-1.5 bg-muted-foreground/25",
          )}
        />
      ))}
    </ol>
  );

  // The tour ends on Home, whatever page creating a project opened under it.
  const leave = (action: () => Promise<void>) => run(async () => {
    await action();
    router.push("/home");
  });

  if (editingProfile) {
    return <ProfileSetupScreen onDone={() => setEditingProfile(false)} />;
  }

  if (onboarding.finalScreen || !step) {
    return (
      <FirstRunLayer label={t("checklistTitle")}>
        <ConfettiBurst />
        <div className="space-y-6 text-center" role="status">
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{t("finalTitle")}</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">{t("checklistFinalHint")}</p>
          </div>
          <Button className={AUTH_SUBMIT_CLASS} disabled={busy} onClick={() => void leave(onboarding.finish)}>
            {busy && <Spinner />}
            {tCommon("continue")}
          </Button>
        </div>
      </FirstRunLayer>
    );
  }

  const primary = (label: string, onClick: () => void) => (
    <Button className={AUTH_SUBMIT_CLASS} disabled={busy} onClick={onClick}>
      {label}
    </Button>
  );
  const secondary = (label: string, onClick: () => void) => (
    <Button variant="outline" className="h-12 w-full rounded-full" disabled={busy} onClick={onClick}>
      {label}
    </Button>
  );

  return (
    <FirstRunLayer
      label={t("checklistTitle")}
      footer={
        <button
          type="button"
          disabled={busy}
          onClick={() => setSkipOpen(true)}
          className="mx-auto mt-4 rounded-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          {t("skip")}
        </button>
      }
    >
      <div className="space-y-8">
        {progress}
        <div className="space-y-2 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{titles[step]}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{descriptions[step]}</p>
          {step === "tickets" && projects.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("ticketsNeedProject")}</p>
          )}
        </div>
        <div className="space-y-3">
          {step === "project" && (
            <>
              {invitation && (
                <Button className={AUTH_SUBMIT_CLASS} disabled={busy || busyId !== null} onClick={() => void run(() => answer(invitation.id, "accept"))}>
                  {t("joinProjectCta", { project: invitation.project_name })}
                </Button>
              )}
              {invitation ? secondary(t("projectCta"), openCreateProject) : primary(t("projectCta"), openCreateProject)}
              {secondary(t("joinCta"), () => setJoinOpen(true))}
            </>
          )}
          {step === "tickets" && (projects.length === 0
            ? primary(t("projectCta"), openCreateProject)
            : primary(t("ticketsCreateCta"), () => openCreateIssue()))}
          {step === "numo" && primary(t("numoCta"), () => {
            openAssistant({ projectId: null, focusComposer: false });
            setViewing(null);
            void run(() => onboarding.acknowledgeStep("numo"));
          })}
          {step === "mcp" && primary(t("mcpCta"), () => setMcpOpen(true))}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Button variant="outline" className="h-12 rounded-full" disabled={busy} onClick={goBack}>
              {tCommon("back")}
            </Button>
            <Button variant="outline" className="h-12 rounded-full" disabled={busy} onClick={skipStep}>
              {tCommon("skip")}
            </Button>
          </div>
        </div>
      </div>

      {/* Skipping cannot be undone: the tour does not come back. */}
      <AlertDialog open={skipOpen} onOpenChange={setSkipOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("skipConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("skipConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void leave(onboarding.dismiss)}>{t("skip")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <OnboardingJoinDialog open={joinOpen} onOpenChange={setJoinOpen} outro="inbox" />
      {/* The agent connection opens here rather than in the settings: the
          tour never navigates (MIN-907). */}
      <Sheet open={mcpOpen} onOpenChange={setMcpOpen}>
        <MobileSheetContent side="bottom" aria-describedby={undefined}>
          {/* A visible title row keeps the sheet's close button off the
              agent list. */}
          <SheetTitle className="flex min-h-11 shrink-0 items-center pr-14 text-lg font-semibold">{t("mcpTitle")}</SheetTitle>
          <MobileSheetScrollArea className="px-1 pb-2">
            <McpConnectPanel
              layout="cards"
              onConnected={() => {
                setMcpOpen(false);
                setViewing(null);
                void run(() => onboarding.acknowledgeStep("mcp"));
              }}
            />
          </MobileSheetScrollArea>
        </MobileSheetContent>
      </Sheet>
    </FirstRunLayer>
  );
}
