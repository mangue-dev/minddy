"use client";

import { cn } from "mangue-ui";
import type { ImportGuide } from "@/lib/import-guides";
import type { ImportCommitResponse } from "@/lib/import-api";
import { ImportGuideBlock } from "@/components/import/import-guide";
import { CsvImportPanel } from "@/components/settings/csv-import-panel";

/**
 * Enter an existing backlog, in its entirety (MIN-45, MIN-98): the procedure at
 * follow on the side of the tool you are leaving (`components/import/import-guide.tsx`),
 * then the real dropzone. The mapping is seen before validating.
 *
 * This is the PAGE version of the gesture — the “Import” tab of the project settings.
 * In modal, the import goes through `components/import/import-wizard-dialog.tsx`,
 * which assembles the same two blocks in three steps: a page scrolls, a
 * modal no. The creation wizard only displays the procedure to follow:
 * its step only collects one file, the project does not yet exist.
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
  /** CSV already held by the caller (deposited on the onboarding card). */
  initialFile?: File | null;
  /** Which tool does the account come from — onboarding makes it an event. */
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
