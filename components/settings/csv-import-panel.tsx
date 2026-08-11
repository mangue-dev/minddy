"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, Spinner, cn } from "mangue-ui";
import { TriangleAlert, X } from "lucide-react";
import { CsvDropzone } from "@/components/import/csv-dropzone";
import { ImportMappingEditor } from "@/components/settings/import-mapping-editor";
import { useCsvImport } from "@/lib/use-csv-import";
import type { ImportCommitResponse } from "@/lib/import-api";
import type { MessageKey } from "@/lib/i18n-keys";

/** Le geste d'import dans une PAGE (MIN-45) : l'onglet « Import » des réglages
    du projet, où le dépôt et son aperçu se lisent en défilant, entre les autres
    sections.

    Le parcours en modale, lui, passe par `ImportWizardDialog` — même hook, même
    tableau de correspondance, mais trois étapes et un CTA pleine largeur : une
    modale n'a pas la place d'une page. Les deux surfaces partagent tout ce qui
    décide (`lib/use-csv-import.ts`) et ne diffèrent que par leur mise en scène.

    Le geste seul : la marche à suivre qui le précède vit dans `import-panel.tsx`.
    Il garde le namespace i18n `Settings` : aucune chaîne n'a changé de place. */
export function CsvImportPanel({
  projectId,
  className,
  initialFile,
  onImported,
}: {
  projectId: string;
  className?: string;
  /** Fichier déjà tenu par l'appelant, analysé comme s'il venait de la zone de
   *  dépôt : un seul chemin de lecture. */
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
                {/* La source est détectée à l'analyse du fichier : clé
                    assemblée à l'exécution. */}
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

          {/* Aucune colonne de titre : le fichier n'est pas refusé, il attend
              qu'on désigne laquelle porte le nom des tickets — juste au-dessus. */}
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

          {/* Les boutons s'ENROULENT : dans une colonne étroite, trois boutons
              sur une ligne sortaient du cadre plutôt que de passer à la ligne. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => void runImport()}
              // Sans colonne de titre, il n'y a pas de ticket à fabriquer : le
              // tableau de correspondance est ouvert, et c'est là que ça se règle.
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
