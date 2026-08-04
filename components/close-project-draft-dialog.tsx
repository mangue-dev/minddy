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
 * Le cousin `CloseDraftDialog` (dialogues de création de ticket et d'objectif,
 * MIN-41) pose exactement la même question, avec les mêmes mots : seul ce qu'il
 * dit du rangement change — la rangée de reprise du dialogue là-bas, la barre
 * latérale ici. Deux composants et non un seul parce que les deux brouillons ne
 * vivent pas au même endroit (localStorage contre table), pas parce que le
 * dessin diffère : le faire diverger serait la faute à éviter.
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
        {/* Trois boutons dans une modale calibrée pour deux (`max-w-sm`) : ils
            tiennent parce que les libellés sont courts, et `flex-wrap` est la
            ceinture — une traduction qui s'allonge passe à la ligne DANS la
            boîte au lieu d'en déborder.
            L'ordre du DOM est celui de la pile mobile lue de bas en haut
            (`flex-col-reverse`) ; en ligne, « Abandonner » repart à gauche pour
            laisser à droite la paire qu'on choisit vraiment. */}
        <AlertDialogFooter className="sm:flex-wrap">
          <AlertDialogCancel>{t("draftCloseCancel")}</AlertDialogCancel>
          {/* `variant`, et non un `className` de couleur : `AlertDialogAction`
              pose les classes du bouton sur un Slot parent, donc une couleur
              écrite ici ne passe pas par tailwind-merge et perd contre celle du
              variant — le bouton restait bleu. */}
          <AlertDialogAction
            variant="destructive"
            onClick={onDiscard}
            className="sm:order-first sm:mr-auto"
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
