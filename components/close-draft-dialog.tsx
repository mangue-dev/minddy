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
 * Ce qu'on demande quand un dialogue de création se ferme sur une saisie
 * (MIN-41). Trois sorties, parce qu'il y a trois intentions et qu'aucune ne doit
 * coûter deux gestes : revenir à la rédaction, garder pour plus tard, ou
 * renoncer. Sans le « Abandonner », renoncer voulait dire enregistrer un
 * brouillon puis aller le supprimer dans la rangée de reprise — la sortie la
 * plus simple était la plus longue.
 *
 * `onDiscard` ferme SANS garder, et jette le brouillon d'origine si le
 * formulaire en venait : sinon on retrouverait, dans les brouillons récents,
 * celui qu'on croyait avoir abandonné.
 *
 * Même dessin et même vocabulaire que `CloseProjectDraftDialog` : c'est la même
 * question, elle se pose de la même façon.
 */
export function CloseDraftDialog({
  open,
  onOpenChange,
  onConfirm,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const t = useTranslations("Drafts");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("closeTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("closeDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        {/* Trois boutons dans une modale calibrée pour deux (`max-w-sm`) : ils
            tiennent parce que les libellés sont courts, et `flex-wrap` est la
            ceinture — une traduction qui s'allonge passe à la ligne DANS la
            boîte au lieu d'en déborder.
            L'ordre du DOM est celui de la pile mobile lue de bas en haut
            (`flex-col-reverse`) ; en ligne, « Abandonner » repart à gauche pour
            laisser à droite la paire qu'on choisit vraiment. */}
        <AlertDialogFooter className="sm:flex-wrap">
          <AlertDialogCancel>{t("keepEditing")}</AlertDialogCancel>
          {/* `variant`, et non un `className` de couleur : AlertDialogAction
              pose les classes du bouton sur un Slot parent, donc une couleur
              écrite ici ne passerait pas par tailwind-merge et perdrait contre
              celle du variant. */}
          <AlertDialogAction
            variant="destructive"
            onClick={onDiscard}
            className="sm:order-first sm:mr-auto"
          >
            {t("closeDiscard")}
          </AlertDialogAction>
          <AlertDialogAction onClick={onConfirm}>
            {t("closeConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
