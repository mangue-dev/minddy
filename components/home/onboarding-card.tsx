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
  cn,
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
import { OnboardingImportDialog } from "@/components/home/onboarding-import-dialog";
import { OnboardingJoinDialog } from "@/components/home/onboarding-join-dialog";

/**
 * Onboarding du nouveau compte (MIN-74), sur le patron d'AutoKap : à gauche les
 * quatre étapes et leur état, à droite la courante, et elle seule. Le titre de
 * l'étape n'est pas répété à droite — la colonne de gauche le tient déjà.
 *
 * Il prend la place du corps de la home tant qu'il n'est pas terminé : pour un
 * compte neuf, les cartes cycle/global, le feedback et la grille de projets
 * n'ont de toute façon rien à montrer. Deux étapes se cochent seules quand la
 * donnée existe (projet, ticket) ; les autres sont acquittées à la main —
 * importer son backlog et connecter un agent sont des propositions, jamais des
 * prérequis. « Passer l'onboarding » reste visible en permanence, sous
 * confirmation : c'est irréversible.
 */

const MOTION = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };

export function OnboardingCard({ onboarding }: { onboarding: UseOnboardingResult }) {
  const t = useTranslations("Onboarding");
  const queryClient = useQueryClient();
  const { user, updateUserMetadata } = useAuth();
  const { openCreateProject } = useProjects();
  const { openCreateIssue } = useCreate();
  const { track } = useAnalytics();
  // Une invitation en attente change l'étape 1 : on n'a plus à expliquer
  // comment se faire inviter, il n'y a qu'à entrer. La plus récente d'abord —
  // l'API les renvoie triées ; les autres restent dans la bannière et l'inbox.
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
    cycles: t("cyclesTitle"),
  };
  const description: Record<OnboardingStepId, string> = {
    project: t("projectDesc"),
    tickets: t("ticketsDesc"),
    mcp: t("mcpDesc"),
    cycles: t("cyclesDesc"),
  };

  /** Acquitte une étape ; la dernière ferme l'onboarding, d'où le mot de fin. */
  const acknowledge = async (step: OnboardingStepId) => {
    setBusy(true);
    try {
      await onboarding.acknowledgeStep(step);
    } finally {
      setBusy(false);
    }
  };

  /** Activer les cycles coche la dernière étape — donc termine l'onboarding. */
  const enableCycles = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await updateUserMetadata({ [CYCLES_ENABLED_META_KEY]: true });
      // Les deux lectures réconcilient la timeline des cycles (ensureCycles) :
      // le résumé, qui est ce que la home a sous les yeux, et le board agrégé.
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
    // Le compte qui clique ici n'a pas de projet à lui : c'est le seul endroit
    // du produit qui le dit, et l'entonnoir d'activation a besoin de le savoir.
    track("onboarding_join_opened");
    setJoinOpen(true);
  };

  /**
   * DÉPÔT SUR TOUTE LA CARTE, pendant l'étape des tickets. On arrive avec un
   * CSV sous le bras, pas avec l'envie d'ouvrir un dialog d'abord : le fichier
   * lâché n'importe où sur l'onboarding ouvre l'import, déjà chargé.
   *
   * `dragenter`/`dragleave` se déclenchent aussi en traversant les enfants —
   * d'où le compteur, sans quoi le survol clignoterait.
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

  // `currentStepId` est non-null tant que les étapes défilent ; sur le mot de
  // fin il vaut null et c'est justement ce qu'on rend.
  if (!currentStepId && !finalScreen) return null;

  return (
    <div className="flex flex-col items-center gap-3">
      <section
        {...dragHandlers}
        className="relative w-full rounded-2xl border border-border bg-card p-2.5 text-card-foreground md:p-3.5"
      >
        <div className="grid gap-3 md:grid-cols-[280px_1fr] md:gap-5">
          {/* Colonne gauche : où j'en suis. */}
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

          {/* Colonne droite : l'étape courante, et elle seule. */}
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
                        {/* Invité : le bouton nomme le projet et y fait entrer
                            d'un clic, au lieu d'ouvrir le mode d'emploi de
                            l'invitation qu'on a déjà reçue. */}
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

                    {/* Deux chemins vers la même étape, et elle se coche de
                        toute façon toute seule dès qu'un ticket existe : celui
                        qu'on vient de créer, ou les cent qu'on vient
                        d'importer. */}
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

                    {currentStepId === "cycles" && (
                      <div className="flex w-full flex-col gap-4">
                        <label className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
                          {/* Toujours décoché ici : cycles activés = étape
                              franchie. On lit quand même la préférence réelle
                              plutôt que de câbler `false` en dur. */}
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

        {/* Voile de dépôt : au-dessus de la carte entière, transparent aux
            événements pour que le `drop` du conteneur reste atteignable. */}
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
          // L'étape se cochera seule au prochain résumé (des tickets existent) ;
          // l'acquitter tout de suite évite d'attendre l'aller-retour.
          void acknowledge("tickets");
        }}
      />
    </div>
  );
}
