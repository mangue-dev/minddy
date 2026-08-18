"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  Button,
  ConfirmDeleteDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Spinner,
  cn,
} from "mangue-ui";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { WizardStepper } from "@/components/wizard/wizard-stepper";
import { SendShortcutTooltip } from "@/components/send-shortcut";
import { useSubmitShortcut } from "@/lib/keyboard/use-submit-shortcut";

/**
 * The modal of a wizard — the form, once and for all.
 *
 * The drawing is that of the project creation wizard, which took it from AutoKap
 * (project-wizard-dialog.tsx): large fixed modal (tokens
 * `--spacing-dialog-w/h`), pill stepper alone at the top, centered column which
 * has the title and subtitle of the step aligned to the left, then the body of
 * the step; at the bottom of this same column, a full-width CTA and the return in
 * discreet link. The body slides from one stage to the next, the rest does not move.
 *
 * A wizard who passes through here no longer has to decide either his modal or his
 * progression, neither its animation, nor its buttons: it describes its steps
 * (`WizardStep[]`) and says where he is. What remains his responsibility is what he
 * really belongs — when a step is valid, what "Continue" means
 * triggers, what it creates in the end.
 *
 * Navigation is CONTROLLED (`stepIndex` + `onStepIndexChange`): the steps
 * of a real journey depend on the answers (the origin of the project decides to
 * the initiation, the integration mode decides the SSO), and a recovery after a
 * going back and forth outside the app must be able to reopen the wizard at the desired step.
 * An index finger placed outside can do all that; a hidden index here, no.
 *
 * The shell only moves backwards to ALREADY validated steps — never forwards:
 * jumping forward would bypass validation of the current step.
 *
 * It also knows how to remember an accidental closure (`dismissConfirm`), which a
 * journey of several stages always ends up asking: a click next to it does not
 * must not take away what we are doing.
 */

export interface WizardStep<Id extends string = string> {
  id: Id;
  /** Title of the step, above its content. */
  title: string;
  /** A line to locate the step. Optional: a self-explanatory title is sufficient. */
  subtitle?: ReactNode;
  content: ReactNode;
  /**
   * Enlarged column (max-w-2xl instead of max-w-lg): for the steps that are
   * LOOK before you read — side-by-side picture maps, not
   * champs.
   */
  wide?: boolean;
  /**
   * The step advances by itself (a clicked card IS the gesture): no CTA.
   * A “Continue” would require a second click to confirm what is coming.
   * to be said.
   */
  hideSubmit?: boolean;
  /** Default: “Continue”. To pass for “Finish”, “Skip”, “Generate”… */
  submitLabel?: string;
  submitDisabled?: boolean;
  /**
   * Stage of no return: what precedes it has produced effects that a step in
   * back does not undo (one key created, one project created). Neither return link,
   * ni pilule cliquable.
   */
  lockBack?: boolean;
}

export function WizardDialog<Id extends string>({
  open,
  onOpenChange,
  label,
  steps,
  stepIndex,
  onStepIndexChange,
  onSubmit,
  submitting = false,
  error,
  dismissConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Modal name for screen readers — that of the wizard, not the step. */
  label: string;
  /** The stages of the route AS IS: the list may change en route. */
  steps: WizardStep<Id>[];
  stepIndex: number;
  /** Step back (step past pill, back link). */
  onStepIndexChange: (index: number) => void;
  /** The CTA has been activated on this step — it's up to the caller to move forward, or not. */
  onSubmit: (stepId: Id) => void;
  submitting?: boolean;
  /** Failure message, below the step body. */
  error?: ReactNode;
  /**
   * The two ACCIDENTAL closes — click out and Escape — require
   * confirmation, with these words. The closing button is never
   * intercepted: clicking a cross is an explicit gesture, and repeating it
   * would not prevent any errors, it would only add one click to whoever wants to exit.
   *
   * Pass `undefined` where there is nothing more to lose (the last step,
   * the first): a question without stakes teaches you to answer without reading.
   */
  dismissConfirm?: {
    title: string;
    description?: string;
    confirmLabel: string;
    cancelLabel: string;
  };
}) {
  const tCommon = useTranslations("Common");
  const [confirmingDismiss, setConfirmingDismiss] = useState(false);
  // ⌘/Ctrl + Enter activates the step CTA — the same gesture as clicking,
  // therefore nothing on a step which advances by itself (`hideSubmit`) or whose
  // button is still grayed out. The CTA is designated by its attribute: the body of
  // the step comes from outside, and a button that forgets its `type` would be
  // otherwise taken for him.
  const submitShortcut = useSubmitShortcut({ selector: "[data-wizard-cta]" });

  // A step may disappear from the list under the index (the user changes
  // an answer in advance): we limit rather than creating emptiness.
  const index = Math.min(Math.max(stepIndex, 0), Math.max(steps.length - 1, 0));
  const step = steps[index];
  const isLast = index >= steps.length - 1;

  if (!step) return null;

  const goToStep = (target: number) => {
    if (submitting || step.lockBack) return;
    if (target >= 0 && target < index) onStepIndexChange(target);
  };

  /**
   * The guard is placed ON THE MODAL, and not on its content: all
   * closures that the modal triggers on its own — click out, Escape, and
   * the slide down the loose leaf — go through this
   * `onOpenChange`, while the brackets `onInteractOutside` /
   * `onEscapeKeyDown` content only exists in the desktop version (in
   * below 480 px, mango-ui returns a `Drawer`, which does not receive them).
   *
   * The close button calls `onOpenChange` LIVE, without going through
   * by the modal: it is therefore not intercepted, and this is desired.
   */
  const handleModalOpenChange = (next: boolean) => {
    if (!next && dismissConfirm) {
      setConfirmingDismiss(true);
      return;
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[var(--spacing-dialog-h)] max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] flex-col overflow-hidden p-0 !rounded-2xl sm:max-h-[var(--spacing-dialog-h)] sm:max-w-[var(--spacing-dialog-w)]"
      >
        {/* The name of the modal is that of the wizard: it does not change from one moment to another.
            step to another. The title of the stage is a title IN the
            modal — it is visible, in the column, with what it announces. */}
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className="sr-only">{step.title}</DialogDescription>

        <div className="absolute top-4 right-4 z-30">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onOpenChange(false)}
            aria-label={tCommon("close")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Header: only where we are. Progression is the only
            thing that does not move from one stage to the next — it holds the top of
            the modal, at the height of the closing button. */}
        <div className="flex shrink-0 justify-center px-6 pt-5 pb-2">
          <WizardStepper
            className="pt-2.5"
            currentStep={index + 1}
            totalSteps={steps.length}
            onStepClick={(s) => goToStep(s - 1)}
            getStepLabel={(s) => steps[s - 1]?.title}
          />
        </div>

        {/* One step HIGHER than the modal must remain achievable.
            `items-center` centered the form in a scrolling box:
            as soon as it overflowed, its TOP passed above the starting point
            scrolling and became inaccessible — we could no longer go back
            au premier champ. Des marges `auto` centrent tout aussi bien tant
            that there is room left, and fall back to zero as soon as there is none
            more: the form then starts from the top and is browsed in
            entier. */}
        <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 pt-4 pb-12">
          <form
            {...submitShortcut}
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(step.id);
            }}
            className={cn(
              "my-auto flex w-full flex-col items-center gap-7",
              step.wide ? "max-w-2xl" : "max-w-lg",
            )}
          >
            <div className="w-full overflow-hidden p-1">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="flex w-full flex-col gap-6"
                >
                  {/* Title and subtitle: placed above what they
                      announce, in the same column and aligned on its edge
                      left, not relegated to a corner of the header. They
                      travel with the content, so they change in the same
                      mouvement. */}
                  <div className="space-y-1.5 text-left">
                    <h2 className="text-xl font-semibold tracking-tight">
                      {step.title}
                    </h2>
                    {step.subtitle && (
                      <p className="max-w-lg text-sm text-muted-foreground">
                        {step.subtitle}
                      </p>
                    )}
                  </div>

                  {step.content}
                </motion.div>
              </AnimatePresence>
            </div>

            {error && (
              <p className="text-center text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="flex w-full flex-col items-center gap-3">
              {!step.hideSubmit && (
                <SendShortcutTooltip
                  scope="form"
                  label={step.submitLabel ?? tCommon("continue")}
                >
                  <Button
                    type="submit"
                    data-wizard-cta
                    className="h-10 w-full"
                    disabled={submitting || step.submitDisabled}
                  >
                    {submitting && <Spinner />}
                    {step.submitLabel ?? tCommon("continue")}
                    {!submitting && !isLast && (
                      <ArrowRight className="ml-1 h-4 w-4" />
                    )}
                  </Button>
                </SendShortcutTooltip>
              )}
              {index > 0 && !step.lockBack && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="bg-transparent text-xs text-muted-foreground hover:bg-transparent hover:text-foreground disabled:opacity-50"
                  onClick={() => goToStep(index - 1)}
                  disabled={submitting}
                >
                  <ArrowLeft className="size-3.5" />
                  {tCommon("back")}
                </Button>
              )}
            </div>
          </form>
        </div>

        {/* Rendered IN the modal: this is what inscribes it above it in
            the Radix layer stack, so the click that closes it does not go back down
            not close the wizard behind. Outside of `<form>`, too: its button
            confirmation has nothing to submit. */}
        {dismissConfirm && (
          <ConfirmDeleteDialog
            open={confirmingDismiss}
            onOpenChange={setConfirmingDismiss}
            title={dismissConfirm.title}
            description={dismissConfirm.description}
            confirmLabel={dismissConfirm.confirmLabel}
            cancelLabel={dismissConfirm.cancelLabel}
            onConfirm={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
