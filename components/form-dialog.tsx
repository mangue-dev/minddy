"use client";

import type { ComponentProps, FormEvent, ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "mangue-ui";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { SendShortcutTooltip } from "@/components/send-shortcut";

/**
 * The base of small modal forms: same native closure (cross,
 * Escape, outside click), same action bar and, when relevant,
 * same microphone connected to the field controlled by the caller.
 *
 * The big composers (ticket, objective, feedback) keep their fields rich
 * and their orchestration Numo; they can reuse `FormDialogActions` as soon as
 * that their actions no longer need additional commands.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel,
  submitDisabled,
  cancelLabel,
  onCancel,
  submitting = false,
  submitIcon,
  className,
  contentProps,
  formClassName = "flex flex-col gap-3",
  formProps,
  dictation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  onSubmit: () => void | Promise<void>;
  submitLabel: string;
  submitDisabled?: boolean;
  cancelLabel?: ReactNode;
  onCancel?: () => void;
  submitting?: boolean;
  submitIcon?: ReactNode;
  className?: string;
  contentProps?: Omit<ComponentProps<typeof DialogContent>, "children" | "className">;
  formClassName?: string;
  formProps?: Omit<ComponentProps<"form">, "children" | "className" | "onSubmit">;
  /** Direct connection: the transcript is delivered to the state which controls the input. */
  dictation?: {
    onTranscription: (text: string) => void;
    disabled?: boolean;
    onProcessingChange?: (processing: boolean) => void;
    autoStart?: boolean;
  };
}) {
  const cancel = () => {
    if (onCancel) onCancel();
    else onOpenChange(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!submitDisabled && !submitting) void onSubmit();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={className} {...contentProps}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form {...formProps} onSubmit={handleSubmit} className={formClassName}>
          {children}
          <FormDialogActions
            submitLabel={submitLabel}
            submitDisabled={submitDisabled}
            submitting={submitting}
            submitIcon={submitIcon}
            cancelLabel={cancelLabel}
            onCancel={cancel}
            dictation={dictation}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Common bar, exported for composers who cannot use the shell. */
export function FormDialogActions({
  submitLabel,
  submitDisabled,
  submitting = false,
  submitIcon,
  cancelLabel,
  onCancel,
  dictation,
  className,
}: {
  submitLabel: string;
  submitDisabled?: boolean;
  submitting?: boolean;
  submitIcon?: ReactNode;
  cancelLabel?: ReactNode;
  onCancel?: () => void;
  dictation?: {
    onTranscription: (text: string) => void;
    disabled?: boolean;
    onProcessingChange?: (processing: boolean) => void;
    autoStart?: boolean;
  };
  className?: string;
}) {
  return (
    <DialogFooter className={className}>
      {dictation ? (
        <DictateButton
          onTranscription={dictation.onTranscription}
          disabled={dictation.disabled || submitting}
          onProcessingChange={dictation.onProcessingChange}
          autoStart={dictation.autoStart}
          className="mr-auto -ml-2"
        />
      ) : null}
      {cancelLabel ? (
        <Button type="button" variant="ghost" disabled={submitting} onClick={onCancel}>
          {cancelLabel}
        </Button>
      ) : null}
      <SendShortcutTooltip scope="form" label={submitLabel}>
        <Button type="submit" disabled={submitDisabled || submitting}>
          {submitIcon}
          {submitLabel}
        </Button>
      </SendShortcutTooltip>
    </DialogFooter>
  );
}
