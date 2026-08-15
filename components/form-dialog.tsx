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
 * Le socle des petits formulaires modaux : même fermeture native (croix,
 * Échap, clic extérieur), même barre d'actions et, lorsqu'il est pertinent,
 * même micro relié au champ contrôlé par l'appelant.
 *
 * Les gros composers (ticket, objectif, feedback) gardent leurs champs riches
 * et leur orchestration Numo ; ils peuvent réemployer `FormDialogActions` dès
 * que leurs actions n'ont plus besoin de commandes supplémentaires.
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
  /** Raccord direct : le transcript est livré au state qui pilote l'input. */
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

/** Barre commune, exportée pour les composers qui ne peuvent pas utiliser le shell. */
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
