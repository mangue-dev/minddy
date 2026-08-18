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
 * What we ask when the project creation wizard closes en route.
 *
 * Three exits, because there are three intentions and none should cost
 * two gestures: return to the wizard, save the entry for later, or give up.
 * Without “Aborting”, abandoning would mean saving a draft and then
 * go and delete it in the sidebar — the simplest exit would be
 * plus longue.
 *
 * The `CloseDraftDialog` cousin (ticket and goal creation dialogs,
 * MIN-41) asks exactly the same question, with the same words: only what he
 * said storage changes — the row of dialogue resumption over there, the bar
 * side here. Two components and not just one because the two drafts do not
 * do not live in the same place (localStorage versus table), not because the
 * drawing differs: making it diverge would be the mistake to avoid.
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
        {/* Three buttons in a modal calibrated for two (`max-w-sm`): they
 fit because the labels are short, and `flex-wrap` is the
 belt — a translation that gets longer goes to the line IN the
 box instead of overflowing it.
 The order of the DOM is that of the moving stack read from bottom to top
 (`flex-col-reverse`); online, “Abandon” goes back to the left to leave the pair you really choose on the right. */}
        <AlertDialogFooter className="sm:flex-wrap">
          <AlertDialogCancel>{t("draftCloseCancel")}</AlertDialogCancel>
          {/* `variant`, not a colored `className`: `AlertDialogAction`
 places the button classes on a parent Slot, so a color
 written here does not pass through tailwind-merge and loses against that of the
 variant — the button remained blue. */}
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
