"use client";

import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "mangue-ui";

/**
 * Confirmation shown when a create dialog is dismissed with unsaved content
 * (MIN-41). Unlike a discard prompt, closing here is non-destructive — the form
 * is stashed as a local draft — so the action button is neutral, not
 * destructive. "Keep editing" backs out; "Close draft" runs `onConfirm`.
 */
export function CloseDraftDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("Drafts");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("closeTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("closeDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("keepEditing")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t("closeConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
