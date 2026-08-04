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
 * Ce qu'on demande quand le wizard de création de projet se ferme en route.
 *
 * Trois sorties, parce qu'il y a trois intentions et qu'aucune ne doit coûter
 * deux gestes : revenir au wizard, garder la saisie pour plus tard, ou renoncer.
 * Sans le « Abandonner », renoncer voudrait dire enregistrer un brouillon puis
 * aller le supprimer dans la barre latérale — la sortie la plus simple serait la
 * plus longue.
 *
 * Le cousin `CloseDraftDialog` (dialogues de création de ticket, MIN-41) n'en a
 * que deux : là-bas le brouillon est local et gratuit, ici il prend une ligne
 * dans la barre latérale jusqu'à ce qu'on s'en occupe.
 */
export function CloseProjectDraftDialog({
  open,
  onOpenChange,
  onSave,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const t = useTranslations("Projects");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("draftCloseTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("draftCloseDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("draftCloseCancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDiscard}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("draftCloseDiscard")}
          </AlertDialogAction>
          <AlertDialogAction onClick={onSave}>
            {t("draftCloseConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
