"use client";

import { useId, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowRight01Icon, CheckIcon, MoreHorizontalIcon, PartyIcon } from "@hugeicons/core-free-icons";
import {
  Button, Collapsible, CollapsibleContent, CollapsibleTrigger,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  Popover, PopoverContent, PopoverTrigger, Spinner, cn, toast,
} from "mangue-ui";
import { DialogClose } from "@/components/ui/dialog";
import Link from "@/components/app-link";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useCreate } from "@/lib/create-context";
import { useOnboardingChecklist } from "@/lib/use-onboarding";
import type { OnboardingStepId } from "@/lib/onboarding";
import { useAssistantPanelActions } from "@/lib/assistant-panel-context";
import { useInvitationResponder } from "@/lib/use-invitations-query";
import { useAnalytics } from "@/lib/use-analytics";
import { CYCLES_ENABLED_META_KEY } from "@/lib/cycle-prefs";
import { useQueryClient } from "@tanstack/react-query";
import { HOME_SUMMARY_KEY } from "@/lib/use-home-summary-query";
import { GLOBAL_BOARD_KEY } from "@/lib/use-global-board-query";
import { OnboardingImportDialog } from "@/components/home/onboarding-import-dialog";
import { OnboardingJoinDialog } from "@/components/home/onboarding-join-dialog";

function LeaveMobileMenu({ mobile, children }: { mobile: boolean; children: ReactElement }) {
  return mobile ? <DialogClose asChild>{children}</DialogClose> : children;
}

interface SidebarOnboardingProps {
  mobile?: boolean;
  onLayerOpenChange?: (open: boolean) => void;
}

/** A route-independent checklist that leaves navigation and the home composer available. */
export function SidebarOnboarding({ mobile = false, onLayerOpenChange }: SidebarOnboardingProps) {
  const onboarding = useOnboardingChecklist();
  const detailId = useId();
  const checklistRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("Onboarding");
  const { user, updateUserMetadata } = useAuth();
  const { projects, openCreateProject } = useProjects();
  const { openCreateIssue } = useCreate();
  const { open } = useAssistantPanelActions();
  const { track } = useAnalytics();
  const queryClient = useQueryClient();
  const { invitations, busyId, answer } = useInvitationResponder();
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState<OnboardingStepId | null>(null);
  const [busy, setBusy] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  if (!onboarding.showChecklist) return null;

  const titles: Record<OnboardingStepId, string> = {
    project: t("projectTitle"), tickets: t("ticketsTitle"), numo: t("numoTitle"),
    mcp: t("mcpTitle"), cycles: t("cyclesTitle"),
  };
  const descriptions: Record<OnboardingStepId, string> = {
    project: t("projectDesc"), tickets: t("ticketsDesc"), numo: t("numoDesc"),
    mcp: t("mcpDesc"), cycles: t("cyclesDesc"),
  };
  const invitation = invitations[0];
  const ownedProject = projects.some((project) => project.owner_id === user?.id);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
      setSelected(null);
      onLayerOpenChange?.(false);
    }
  };

  const enableCycles = async () => {
    await updateUserMetadata({ [CYCLES_ENABLED_META_KEY]: true });
    void queryClient.invalidateQueries({ queryKey: HOME_SUMMARY_KEY });
    void queryClient.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY });
  };

  const selectStep = (step: OnboardingStepId, next: boolean) => {
    setSelected(next ? step : null);
    onLayerOpenChange?.(next);
  };

  const stepRowClass = "group flex min-h-9 w-full items-center gap-3 rounded-lg py-2 pl-[9px] pr-3 text-left text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring";
  const progress = onboarding.completedCount / onboarding.totalCount;

  return (
    <>
      <Collapsible
        ref={checklistRef}
        open={expanded}
        onOpenChange={setExpanded}
        className="mx-2.5 mb-2 shrink-0 border-t border-border/60 pt-2"
        data-sidebar-onboarding
      >
        <div className="flex items-center gap-1">
          <CollapsibleTrigger aria-label={`${t("checklistTitle")}, ${t("progress", { done: onboarding.completedCount, total: onboarding.totalCount })}`} className={cn(stepRowClass, "min-w-0 flex-1 hover:bg-sidebar-accent/60")}>
            <span
              role="progressbar"
              aria-label={t("checklistTitle")}
              aria-valuemin={0}
              aria-valuemax={onboarding.totalCount}
              aria-valuenow={onboarding.completedCount}
              className="size-[18px] shrink-0 text-muted-foreground"
            >
              <svg viewBox="0 0 20 20" className="size-full -rotate-90" aria-hidden>
                <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-20" />
                <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" pathLength="100" strokeDasharray={`${progress * 100} 100`} />
              </svg>
            </span>
            <span className="min-w-0 flex-1">{t("checklistTitle")}</span>
            <span className="text-xs tabular-nums text-muted-foreground" aria-label={t("progress", { done: onboarding.completedCount, total: onboarding.totalCount })}>
              {onboarding.completedCount}/{onboarding.totalCount}
            </span>
            <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" aria-hidden />
          </CollapsibleTrigger>
          <DropdownMenu onOpenChange={onLayerOpenChange}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("checklistOptions")} disabled={busy} className="text-muted-foreground">
                <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void run(onboarding.dismiss)}>{t("hideChecklist")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <CollapsibleContent>
          <div className="max-h-[35dvh] overflow-y-auto overscroll-contain pt-2">
            {onboarding.finalScreen ? (
              <div className="flex flex-col items-start gap-3 px-[9px] pb-3 pt-1" role="status">
                <div className="flex items-center gap-3">
                  <HugeiconsIcon icon={PartyIcon} className="size-[18px] text-muted-foreground" aria-hidden />
                  <p className="text-sm">{t("finalTitle")}</p>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{t("checklistFinalHint")}</p>
                <Button size="sm" variant="outline" onClick={() => void run(onboarding.finish)} disabled={busy}>{t("checklistFinish")}</Button>
              </div>
            ) : (
              <ol className="flex flex-col gap-1">
                {onboarding.steps.map((step) => (
                  <li key={step.id}>
                    {step.completed ? (
                      <div className={cn(stepRowClass, "text-muted-foreground")}>
                        <HugeiconsIcon icon={CheckIcon} className="size-[18px] shrink-0" aria-hidden />
                        <span className="flex-1">{titles[step.id]}</span>
                        <span className="sr-only">{t("stepCompleted")}</span>
                      </div>
                    ) : (
                      <Popover open={selected === step.id} onOpenChange={(next) => selectStep(step.id, next)}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            disabled={busy}
                            className={cn(stepRowClass, "text-sidebar-foreground hover:bg-sidebar-accent/60 data-[state=open]:bg-sidebar-accent/60")}
                          >
                            <span aria-hidden className="flex size-[18px] shrink-0 items-center justify-center">
                              <span className={cn("size-3.5 rounded-full border", step.id === onboarding.currentStepId ? "border-sidebar-foreground/60" : "border-muted-foreground/35")} />
                            </span>
                            <span className="min-w-0 flex-1">{titles[step.id]}</span>
                            <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:opacity-100" aria-hidden />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          side={mobile ? "top" : "right"}
                          align={mobile ? "center" : "end"}
                          sideOffset={12}
                          container={mobile ? checklistRef.current?.closest<HTMLElement>('[role="dialog"]') : undefined}
                          className="w-80 min-w-0 max-w-[calc(100vw-2rem)] gap-4 p-5"
                          aria-labelledby={`${detailId}-${step.id}`}
                        >
                          <div className="flex flex-col gap-2">
                            <h2 id={`${detailId}-${step.id}`} className="text-sm font-medium">{titles[step.id]}</h2>
                            <p className="text-sm leading-relaxed text-muted-foreground">{descriptions[step.id]}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {step.id === "project" && (
                              <>
                                {invitation && (
                                  <Button size="sm" disabled={busyId !== null || busy} onClick={() => void run(() => answer(invitation.id, "accept"))}>{t("joinProjectCta", { project: invitation.project_name })}</Button>
                                )}
                                <LeaveMobileMenu mobile={mobile}><Button size="sm" onClick={() => { selectStep(step.id, false); openCreateProject(); }}>{t("projectCta")}</Button></LeaveMobileMenu>
                                <Button size="sm" variant="outline" onClick={() => { track("onboarding_join_opened"); setJoinOpen(true); selectStep(step.id, false); }}>{t("joinCta")}</Button>
                              </>
                            )}
                            {step.id === "tickets" && (
                              projects.length === 0 ? (
                                <LeaveMobileMenu mobile={mobile}><Button size="sm" onClick={() => { selectStep(step.id, false); openCreateProject(); }}>{t("projectCta")}</Button></LeaveMobileMenu>
                              ) : (
                                <>
                                  <LeaveMobileMenu mobile={mobile}><Button size="sm" onClick={() => { selectStep(step.id, false); openCreateIssue(); }}>{t("ticketsCreateCta")}</Button></LeaveMobileMenu>
                                  {ownedProject && <Button size="sm" variant="outline" onClick={() => { setImportOpen(true); selectStep(step.id, false); }}>{t("ticketsImportCta")}</Button>}
                                </>
                              )
                            )}
                            {step.id === "numo" && (
                              <LeaveMobileMenu mobile={mobile}><Button size="sm" disabled={busy} onClick={() => { selectStep(step.id, false); open({ projectId: null }); void run(() => onboarding.acknowledgeStep("numo")); }}>{t("numoCta")}</Button></LeaveMobileMenu>
                            )}
                            {step.id === "mcp" && (
                              <>
                                <LeaveMobileMenu mobile={mobile}><Button size="sm" asChild><Link href="/settings?tab=mcp" onClick={() => selectStep(step.id, false)}>{t("mcpCta")}</Link></Button></LeaveMobileMenu>
                                <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => onboarding.acknowledgeStep("mcp"))}>{t("markDone")}</Button>
                              </>
                            )}
                            {step.id === "cycles" && <Button size="sm" disabled={busy} onClick={() => void run(enableCycles)}>{t("cyclesToggle")}</Button>}
                          </div>

                          {step.id === "tickets" && projects.length === 0 && <p className="text-sm text-muted-foreground">{t("ticketsNeedProject")}</p>}
                          <div className="border-t border-border pt-3">
                            <button type="button" disabled={busy} onClick={() => void run(() => onboarding.acknowledgeStep(step.id))} className="flex items-center gap-2 rounded-sm text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                              {busy && <Spinner className="size-3" />}{t("skipStep")}
                            </button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
      <OnboardingJoinDialog open={joinOpen} onOpenChange={setJoinOpen} outro="inbox" />
      <OnboardingImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={() => { setImportOpen(false); void run(() => onboarding.acknowledgeStep("tickets")); }} />
    </>
  );
}
