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
 * Le parcours d'import d'un backlog, en grand (MIN-45, MIN-98, MIN-171).
 *
 * Avant, l'import vivait dans une modale `sm:max-w-lg` : la marche à suivre, le
 * dropzone, le tableau de correspondance et TROIS boutons côte à côte dans une
 * colonne de 32 rem. Les boutons débordaient, et le tableau — le seul endroit
 * où un import se répare — était un accordéon replié tout en bas d'une modale
 * qui défilait.
 *
 * Ce sont trois questions, et elles arrivent l'une après l'autre : d'où l'on
 * part, comment on lit le fichier, ce qu'on écrit. C'est exactement la forme
 * d'un wizard, alors on prend celui du dépôt (`wizard-dialog.tsx`) : grande
 * modale (90vw × 90vh), stepper en haut, CTA pleine largeur en bas de la
 * colonne — plus rien à placer à la main, plus rien qui déborde.
 *
 * Le dépôt du fichier EST le geste de la première étape (`hideSubmit`) : elle
 * avance d'elle-même dès que le CSV est analysé. Revenir en arrière depuis la
 * correspondance repose donc la question du fichier, et donc l'oublie — sinon
 * on retomberait sur un dropzone qui ne veut plus rien dire.
 */
export function ImportWizardDialog({
  open,
  onOpenChange,
  projectId,
  initialFile,
  onProviderSelected,
  onImported,
  /** Ce que seul l'appelant sait : dans quel projet importer (onboarding). */
  target,
  /** Une sortie de côté, sous le dropzone (« le faire plus tard »). */
  sourceFooter,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** CSV déjà tenu par l'appelant (dépôt sur la carte d'onboarding, wizard de
   *  création) : le parcours s'ouvre alors directement sur la correspondance. */
  initialFile?: File | null;
  /** De quel outil vient le compte — l'onboarding en fait un événement. */
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

  // Le fichier est lu : la question suivante est celle de la correspondance.
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
      // La carte de l'outil, puis le dépôt : le fichier déposé EST le geste,
      // un « Continuer » ne ferait que redemander ce qui vient d'être dit.
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

            {/* Aucune colonne de titre : le fichier n'est pas refusé, il attend
                qu'on désigne laquelle porte le nom des tickets — juste en
                dessous. */}
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
      /* Les trois pilules dès l'ouverture, fichier ou pas : le parcours ne
         dépend d'aucune réponse — il fait trois pas, et le dire tout de suite
         est justement ce qu'un stepper sert à faire. */
      steps={steps}
      stepIndex={stepIndex}
      onStepIndexChange={(index) => {
        // Reculer jusqu'au dropzone, c'est reposer la question du fichier :
        // l'aperçu du précédent n'aurait plus rien à voir avec ce qu'on y
        // déposerait.
        if (index === 0) reset();
        setStepIndex(index);
      }}
      submitting={importing}
      /* Le parcours ne demande confirmation qu'une fois le fichier lu : avant,
         il n'y a rien à perdre — et une question sans enjeu apprend à répondre
         sans lire. */
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

/** Le fichier qu'on est en train de lire — rappelé en tête des deux étapes qui
 *  en parlent, parce qu'on y prend des décisions à son sujet. */
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
