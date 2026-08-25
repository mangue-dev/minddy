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

export function LocalIssueRunConfirmation({
  open,
  folder,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  folder: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("Agent");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("localIssueConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("localIssueConfirmDescription", { folder })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("localIssueConfirmCancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t("localIssueConfirmAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
