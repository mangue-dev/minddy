"use client";

import { ImportWizardDialog } from "@/components/import/import-wizard-dialog";

/**
 * L'amorce d'un projet par un import (MIN-171) — la surface que `?setup=import`
 * ouvre sur le board du projet qui vient d'être créé.
 *
 * Le parcours est celui du wizard d'import (`import-wizard-dialog.tsx`), tel
 * quel : ce dialog ne lui ajoute rien — pas même le sélecteur de projet du
 * dialog d'onboarding, puisque ici le projet est connu, c'est celui qu'on
 * regarde.
 *
 * `initialFile` est le CSV déposé pendant le wizard de création : le parcours
 * s'ouvre alors directement sur la correspondance.
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
  return (
    <ImportWizardDialog
      open={open}
      onOpenChange={onOpenChange}
      projectId={projectId}
      initialFile={initialFile}
      onImported={() => onOpenChange(false)}
    />
  );
}
