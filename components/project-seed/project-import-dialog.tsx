"use client";

import { ImportWizardDialog } from "@/components/import/import-wizard-dialog";

/**
 * The start of a project by an import (MIN-171) — the surface that `?setup=import`
 * opens on the board of the project which has just been created.
 *
 * The route is that of the import wizard (`import-wizard-dialog.tsx`), tel
 * which: this dialog does not add anything to it — not even the project selector of the
 * onboarding dialog, since here the project is known, it is the one that we
 * look at.
 *
 * `initialFile` is the CSV deposited during the wizard creation: the path
 * then opens directly to the correspondence.
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
