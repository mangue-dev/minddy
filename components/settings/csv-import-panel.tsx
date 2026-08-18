"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, Spinner, cn } from "mangue-ui";
import { TriangleAlert, X } from "lucide-react";
import { CsvDropzone } from "@/components/import/csv-dropzone";
import { ImportMappingEditor } from "@/components/settings/import-mapping-editor";
import { useCsvImport } from "@/lib/use-csv-import";
import type { ImportCommitResponse } from "@/lib/import-api";
import type { MessageKey } from "@/lib/i18n-keys";

/** The import gesture in a PAGE (MIN-45): the “Import” tab of the settings
    of the project, where the deposit and its overview can be read by scrolling, among the others
    sections.

    The modal route goes through `ImportWizardDialog` — same hook, same
    correspondence table, but three steps and a full-width CTA: one
    modal does not have the space of a page. The two surfaces share everything that
    decides (`lib/use-csv-import.ts`) and only differ in their staging.

    The gesture alone: ​​the procedure that precedes it lives in `import-panel.tsx`.
    It keeps the i18n namespace `Settings`: no string has changed place. */
export function CsvImportPanel({
  projectId,
  className,
  initialFile,
  onImported,
}: {
  projectId: string;
  className?: string;
  /** File already held by the caller, analyzed as if it came from the zone of
   * repository: a single reading path. */
  initialFile?: File | null;
  onImported?: (result: ImportCommitResponse) => void;
}) {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const tStatus = useTranslations("Status");

  const {
    context,
    prepared,
    mapping,
    preview,
    aiApplied,
    aiPending,
    importing,
    statusCounts,
    newCategoryCount,
    hasTitleColumn,
    mappingTouched,
    handleFile,
    reset,
    changeMapping,
    resetMapping,
    runImport,
  } = useCsvImport({ projectId, initialFile, onImported });

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {!prepared && <CsvDropzone onFile={(file) => void handleFile(file)} />}

      {prepared && mapping && preview && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{prepared.fileName}</p>
              <p className="text-xs text-muted-foreground">
                {/* The source is detected when analyzing the file: key
                    assembly at execution. */}
                {t(`importSource_${prepared.source}` as MessageKey<"Settings">)} —{" "}
                {t("importPreviewCount", { count: preview.issues.length })}
                {newCategoryCount > 0 &&
                  ` · ${t("importCategoriesToCreate", { count: newCategoryCount })}`}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={reset}
              disabled={importing}
              aria-label={tc("cancel")}
            >
              <X />
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {statusCounts.map(({ status, count }) => (
              <Badge key={status} variant="secondary" className="font-normal">
                {tStatus(status)} · {count}
              </Badge>
            ))}
          </div>

          <ImportMappingEditor
            stats={prepared.stats}
            mapping={mapping}
            members={context.members}
            categories={context.categories}
            onChange={changeMapping}
            aiApplied={aiApplied}
            aiPending={aiPending}
          />

          {/* No title column: the file is not refused, it is waiting
              let us designate which one bears the name of the tickets — just above. */}
          {!hasTitleColumn && (
            <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
              {t("importErrorInvalid")}
            </p>
          )}

          {preview.warnings.length > 0 && (
            <ul className="flex flex-col gap-1">
              {preview.warnings.map((w, i) => (
                <li
                  key={i}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                  {t(`importWarn_${w.key}`, {
                    value: w.value ?? "",
                    count: w.count,
                  })}
                </li>
              ))}
            </ul>
          )}

          {/* The buttons ROLL UP: in a narrow column, three buttons
              on a line went out of frame rather than moving into the line. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => void runImport()}
              // Without a title column, there is no ticket to produce: the
              // correspondence table is open, and that's where it's settled.
              disabled={importing || preview.issues.length === 0}
            >
              {importing && <Spinner />}
              {t("importButton", { count: preview.issues.length })}
            </Button>
            {mappingTouched && (
              <Button
                type="button"
                variant="ghost"
                onClick={resetMapping}
                disabled={importing}
              >
                {t("importMappingReset")}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={reset} disabled={importing}>
              {tc("cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
