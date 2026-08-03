"use client";

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "mangue-ui";
import { ImportPanel } from "@/components/settings/import-panel";

/**
 * L'amorce d'un projet par un import (MIN-171) — la surface que `?setup=import`
 * ouvre sur le board du projet qui vient d'être créé.
 *
 * Le panneau est celui des réglages, tel quel (`import-panel.tsx`) : le geste
 * d'import existe depuis MIN-45, il n'était qu'enterré là où personne ne le
 * cherche le jour où il crée son projet. Ce dialog ne lui ajoute rien — pas
 * même le sélecteur de projet du dialog d'onboarding : ici, le projet est
 * connu, c'est celui qu'on regarde.
 *
 * `initialFile` est le CSV déposé pendant le wizard : le panneau s'ouvre alors
 * directement sur l'aperçu du mapping.
 */
export function ProjectImportDialog({
  open,
  onOpenChange,
  projectId,
  initialFile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  initialFile?: File | null;
}) {
  const t = useTranslations("Onboarding");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("importTitle")}</DialogTitle>
          <DialogDescription>{t("importDesc")}</DialogDescription>
        </DialogHeader>

        <ImportPanel
          projectId={projectId}
          initialFile={initialFile}
          onImported={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
