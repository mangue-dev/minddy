"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Badge, Button, Spinner, cn, toast } from "mangue-ui";
import { FileUp, TriangleAlert, X } from "lucide-react";
import { mapCsvToIssues } from "@/lib/import/parse";
import { MAX_IMPORT_CSV_BYTES, type ImportParseResult } from "@/lib/import/types";
import { importIssuesApi, type ImportCommitResponse } from "@/lib/import-api";
import { ISSUE_STATUSES } from "@/lib/issue-validation";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import type { MessageKey } from "@/lib/i18n-keys";

type Preview = Extract<ImportParseResult, { ok: true }>;

/** Le geste d'import lui-même (MIN-45) : déposer un export Linear / Jira /
    Trello ou un CSV générique, voir le mapping AVANT de valider (même parseur
    que celui que le serveur rejoue au commit), importer en un POST.

    Le geste seul : la marche à suivre qui le précède vit dans `import-panel.tsx`,
    qui assemble les deux et sert aussi bien les réglages du projet que le dialog
    d'import de l'onboarding. Il garde le namespace i18n `Settings` : aucune
    chaîne n'a changé de place. */
export function CsvImportPanel({
  projectId,
  className,
  initialFile,
  onImported,
}: {
  projectId: string;
  className?: string;
  /** Fichier déjà tenu par l'appelant — l'onboarding accepte le dépôt sur
   *  toute sa carte et ouvre le dialog avec le CSV en main. Analysé comme s'il
   *  venait de la zone de dépôt : un seul chemin de lecture. */
  initialFile?: File | null;
  onImported?: (result: ImportCommitResponse) => void;
}) {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const tStatus = useTranslations("Status");
  const queryClient = useQueryClient();
  const { categories } = useCategoriesQuery(projectId);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setFileName(null);
    setCsvText(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_IMPORT_CSV_BYTES) {
        toast.error(t("importErrorTooLarge"));
        return;
      }
      const text = await file.text();
      const result = mapCsvToIssues(text);
      if (!result.ok) {
        toast.error(
          result.error === "tooManyIssues"
            ? t("importErrorTooMany")
            : result.error === "empty"
              ? t("importErrorEmpty")
              : t("importErrorInvalid")
        );
        return;
      }
      if (result.issues.length === 0) {
        toast.error(t("importErrorEmpty"));
        return;
      }
      setFileName(file.name);
      setCsvText(text);
      setPreview(result);
    },
    [t]
  );

  // Un fichier confié par l'appelant est analysé une fois, à l'identité de
  // l'objet `File` : sans la marque, chaque rendu relancerait la lecture et
  // effacerait l'aperçu qu'on vient d'obtenir.
  const handledFileRef = useRef<File | null>(null);
  useEffect(() => {
    if (!initialFile || handledFileRef.current === initialFile) return;
    handledFileRef.current = initialFile;
    void handleFile(initialFile);
  }, [initialFile, handleFile]);

  // Status breakdown in board order; label names not matching an existing
  // category (case-insensitive) will be created by the import.
  const statusCounts = useMemo(() => {
    if (!preview) return [];
    const counts = new Map<string, number>();
    for (const issue of preview.issues) {
      counts.set(issue.status, (counts.get(issue.status) ?? 0) + 1);
    }
    return ISSUE_STATUSES.filter((s) => counts.has(s)).map((s) => ({
      status: s,
      count: counts.get(s)!,
    }));
  }, [preview]);

  const newCategoryCount = useMemo(() => {
    if (!preview) return 0;
    const existing = new Set(categories.map((c) => c.name.toLowerCase()));
    const missing = new Set<string>();
    for (const issue of preview.issues) {
      for (const label of issue.labels) {
        const key = label.toLowerCase();
        if (!existing.has(key)) missing.add(key);
      }
    }
    return missing.size;
  }, [preview, categories]);

  const handleImport = async () => {
    if (!csvText || importing) return;
    setImporting(true);
    try {
      const result = await importIssuesApi(projectId, csvText);
      toast.success(t("importSuccessToast", { count: result.created }));
      void queryClient.invalidateQueries({ queryKey: ["issues", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["categories", projectId] });
      reset();
      onImported?.(result);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const template = [
      "title,description,status,priority,effort,labels,due date,id,parent",
      '"Set up the landing page","First draft in Figma",todo,high,m,"design; marketing",2026-09-30,T-1,',
      '"Write the hero copy",,backlog,medium,s,marketing,,T-2,T-1',
    ].join("\n");
    const url = URL.createObjectURL(new Blob([template], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "minddy-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {!preview && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center outline-none transition-colors",
              dragOver
                ? "border-ring bg-accent/40"
                : "border-border hover:border-ring/60 focus-visible:border-ring"
            )}
          >
            <FileUp className="size-5 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">{t("importDropTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("importDropHint")}</p>
          </div>
          <button
            type="button"
            onClick={downloadTemplate}
            className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {t("importTemplateLink")}
          </button>
        </>
      )}

      {preview && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{fileName}</p>
              <p className="text-xs text-muted-foreground">
                {/* La source est détectée à l'analyse du fichier : clé
                    assemblée à l'exécution. */}
                {t(`importSource_${preview.source}` as MessageKey<"Settings">)} —{" "}
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

          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => void handleImport()} disabled={importing}>
              {importing && <Spinner />}
              {t("importButton", { count: preview.issues.length })}
            </Button>
            <Button type="button" variant="ghost" onClick={reset} disabled={importing}>
              {tc("cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
