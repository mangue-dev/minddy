"use client";

import { cn } from "mangue-ui";
import type { ImportGuide } from "@/lib/import-guides";
import type { ImportCommitResponse } from "@/lib/import-api";
import { ImportGuideBlock } from "@/components/import/import-guide";
import { CsvImportPanel } from "@/components/settings/csv-import-panel";

/**
 * Faire entrer un backlog existant, en entier (MIN-45, MIN-98) : la marche à
 * suivre du côté de l'outil qu'on quitte (`components/import/import-guide.tsx`),
 * puis le vrai dropzone. Le mapping se voit avant de valider.
 *
 * Le même composant sert les réglages du projet (`project-import-section.tsx`)
 * et le dialog d'import de l'onboarding
 * (`components/home/onboarding-import-dialog.tsx`) : on ne sortait pas de la
 * home pour importer, et il n'y a aucune raison que la marche à suivre soit
 * plus courte une fois installé. Le wizard de création, lui, n'affiche que la
 * marche à suivre : son étape ne récolte qu'un fichier, le projet n'existant
 * pas encore.
 */
export function ImportPanel({
  projectId,
  className,
  initialFile,
  onProviderSelected,
  onImported,
}: {
  projectId: string;
  className?: string;
  /** CSV déjà tenu par l'appelant (dépôt sur la carte d'onboarding). */
  initialFile?: File | null;
  /** De quel outil vient le compte — l'onboarding en fait un événement. */
  onProviderSelected?: (guide: ImportGuide) => void;
  onImported?: (result: ImportCommitResponse) => void;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-4", className)}>
      <ImportGuideBlock onProviderSelected={onProviderSelected} />

      <CsvImportPanel
        projectId={projectId}
        initialFile={initialFile}
        onImported={onImported}
      />
    </div>
  );
}
