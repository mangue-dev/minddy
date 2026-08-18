"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, cn } from "mangue-ui";
import { FileText, TriangleAlert } from "lucide-react";
import { WizardDialog, type WizardStep } from "@/components/wizard/wizard-dialog";
import { ImportGuideBlock } from "@/components/import/import-guide";
import { CsvDropzone } from "@/components/import/csv-dropzone";
import { ImportMappingEditor } from "@/components/settings/import-mapping-editor";
import { useCsvImport } from "@/lib/use-csv-import";
import type { ImportGuide } from "@/lib/import-guides";
import type { ImportCommitResponse } from "@/lib/import-api";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * The backlog import process, in large format (MIN-45, MIN-98, MIN-171).
 *
 * Before, import lived in a `sm:max-w-lg` mode: the procedure to follow, the
 * dropzone, the lookup table and THREE buttons side by side in one
 * column of 32 rem. The buttons were overflowing, and the board — the only place
 * where an import is repaired — was an accordion folded at the bottom of a modal
 * who was parading.
 *
 * These are three questions, and they come one after the other: where do we
 * part, how we read the file, what we write. This is exactly the shape
 * of a wizard, then we take that of the repository (`wizard-dialog.tsx`): large
 * modal (90vw × 90vh), stepper at the top, full width CTA at the bottom of the
 * column — nothing to place by hand, nothing to overflow.
 *
 * Submitting the file IS the gesture of the first step (`hideSubmit`): it
 * advances by itself as soon as the CSV is analyzed. Go back from
 * correspondence therefore raises the question of the file, and therefore forgets it - otherwise
 * we would come back to a dropzone which no longer means anything.
 */
export function ImportWizardDialog({
  open,
  onOpenChange,
  projectId,
  initialFile,
  onProviderSelected,
  onImported,
  /** What only the caller knows: into which project to import (onboarding). */
  target,
  /** A side exit, under the dropzone (“do it later”). */
  sourceFooter,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** CSV already held by the caller (deposit on the onboarding card, wizard of
   * creation): the route then opens directly to the correspondence. */
  initialFile?: File | null;
  /** Which tool does the account come from — onboarding makes it an event. */
  onProviderSelected?: (guide: ImportGuide) => void;
  onImported?: (result: ImportCommitResponse) => void;
  target?: ReactNode;
  sourceFooter?: ReactNode;
}) {
  const t = useTranslations("Settings");
  const tOnboarding = useTranslations("Onboarding");
  const tc = useTranslations("Common");
  const tStatus = useTranslations("Status");

  const [stepIndex, setStepIndex] = useState(0);

  const handleImported = useCallback(
    (result: ImportCommitResponse) => {
      setStepIndex(0);
      onOpenChange(false);
      onImported?.(result);
    },
    [onImported, onOpenChange]
  );

  // The file is read: the next question is that of correspondence.
  const goToMapping = useCallback(() => setStepIndex(1), []);

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
  } = useCsvImport({
    projectId,
    initialFile,
    onImported: handleImported,
    onPrepared: goToMapping,
  });

  const count = preview?.issues.length ?? 0;

  const steps: WizardStep<"source" | "mapping" | "review">[] = [
    {
      id: "source",
      title: tOnboarding("importTitle"),
      subtitle: tOnboarding("importDesc"),
      wide: true,
      // The tool map, then the deposit: the file deposited IS the gesture,
      // a “Continue” would only repeat what was just said.
      hideSubmit: true,
      content: (
        <div className="flex flex-col gap-4">
          {target}
          <ImportGuideBlock onProviderSelected={onProviderSelected} />
          <CsvDropzone size="lg" onFile={(file) => void handleFile(file)} />
          {sourceFooter}
        </div>
      ),
    },
    {
      id: "mapping",
      title: t("importMappingTitle"),
      subtitle: t("importMappingDesc"),
      wide: true,
      submitDisabled: !hasTitleColumn || count === 0,
      content:
        prepared && mapping ? (
          <div className="flex flex-col gap-3">
            <FileLine
              fileName={prepared.fileName}
              sourceLabel={t(
                `importSource_${prepared.source}` as MessageKey<"Settings">
              )}
              count={count}
              onReset={mappingTouched ? resetMapping : undefined}
              resetLabel={t("importMappingReset")}
            />

            {/* No title column: the file is not refused, it is waiting
 that we designate which one bears the name of the tickets — just in
 below. */}
            {!hasTitleColumn && (
              <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
                <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                {t("importErrorInvalid")}
              </p>
            )}

            <ImportMappingEditor
              collapsible={false}
              stats={prepared.stats}
              mapping={mapping}
              members={context.members}
              categories={context.categories}
              onChange={changeMapping}
              aiApplied={aiApplied}
              aiPending={aiPending}
            />
          </div>
        ) : null,
    },
    {
      id: "review",
      title: t("importReviewTitle"),
      subtitle: t("importReviewDesc"),
      submitLabel: t("importButton", { count }),
      submitDisabled: count === 0,
      content:
        prepared && preview ? (
          <div className="flex flex-col gap-4">
            <FileLine
              fileName={prepared.fileName}
              sourceLabel={t(
                `importSource_${prepared.source}` as MessageKey<"Settings">
              )}
              count={count}
            />

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t("importValuesStatus")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {statusCounts.map(({ status, count: n }) => (
                  <Badge key={status} variant="secondary" className="font-normal">
                    {tStatus(status)} · {n}
                  </Badge>
                ))}
              </div>
            </div>

            {newCategoryCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {t("importCategoriesToCreate", { count: newCategoryCount })}
              </p>
            )}

            {preview.warnings.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-lg border border-border p-3">
                {preview.warnings.map((w, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-1.5 text-xs text-muted-foreground"
                  >
                    <TriangleAlert
                      className="mt-0.5 size-3.5 shrink-0"
                      aria-hidden
                    />
                    {t(`importWarn_${w.key}`, {
                      value: w.value ?? "",
                      count: w.count,
                    })}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null,
    },
  ];

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      reset();
      setStepIndex(0);
    }
    onOpenChange(next);
  };

  return (
    <WizardDialog
      open={open}
      onOpenChange={handleOpenChange}
      label={tOnboarding("importTitle")}
      /* The three pills from the opening, file or not: the course does not
 depends on no answer — it takes three steps, and saying it right away
 is precisely what a stepper does. */
      steps={steps}
      stepIndex={stepIndex}
      onStepIndexChange={(index) => {
        // Going back to the dropzone means asking the question of the file again:
        // the preview of the previous one would no longer have anything to do with what we see there
        // would file.
        if (index === 0) reset();
        setStepIndex(index);
      }}
      submitting={importing}
      /* The route only asks for confirmation once the file has been read: before,
 there is nothing to lose — and a question without stakes teaches how to answer
 without reading. */
      dismissConfirm={
        prepared
          ? {
              title: t("importQuitTitle"),
              description: t("importQuitDescription"),
              confirmLabel: t("importQuitConfirm"),
              cancelLabel: tc("cancel"),
            }
          : undefined
      }
      onSubmit={(id) => {
        if (id === "mapping") setStepIndex(2);
        else if (id === "review") void runImport();
      }}
    />
  );
}

/** The file we are reading — recalled at the top of the two steps that
 * talk about it, because decisions are made about it. */
function FileLine({
  fileName,
  sourceLabel,
  count,
  onReset,
  resetLabel,
  className,
}: {
  fileName: string;
  sourceLabel: string;
  count: number;
  onReset?: () => void;
  resetLabel?: string;
  className?: string;
}) {
  const t = useTranslations("Settings");
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2",
        className
      )}
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{fileName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {sourceLabel} — {t("importPreviewCount", { count })}
        </p>
      </div>
      {onReset && resetLabel && (
        <Button type="button" variant="ghost" size="sm" onClick={onReset}>
          {resetLabel}
        </Button>
      )}
    </div>
  );
}
