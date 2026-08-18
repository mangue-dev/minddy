"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import { issuesFromMapping, prepareImport } from "@/lib/import/parse";
import { buildCsvDigest } from "@/lib/import/digest";
import { mappingHasGaps, mergeMapping } from "@/lib/import/mapping";
import {
  MAX_IMPORT_CSV_BYTES,
  type ImportContext,
  type ImportMapping,
  type ImportSource,
} from "@/lib/import/types";
import type { TableStats } from "@/lib/import/stats";
import type { CsvTable } from "@/lib/import/normalize";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import {
  fetchImportMappingApi,
  importIssuesApi,
  type ImportCommitResponse,
} from "@/lib/import-api";
import { ISSUE_STATUSES } from "@/lib/issue-validation";

/** The dropped file, as the preview holds it: read once, reread never. */
export interface PreparedCsv {
  fileName: string;
  csvText: string;
  table: CsvTable;
  /** The column count - recalculate each time the table of
 * is retouched, the correspondence would be seen on the screen on a file of 2,000 lines. */
  stats: TableStats;
  source: ImportSource;
  /** The original plan — what “reset” leads back to. */
  baseMapping: ImportMapping;
}

/**
 * The import gesture (MIN-45), without its screen: read the file, draw a
 * reading plan, let the model fill in the gaps, reduce the preview to
 * each retouch, commit.
 *
 * Taken from the settings panel because it now has TWO surfaces — the
 * inline panel and the import wizard (`import-wizard-dialog.tsx`) — and
 * that neither of the two should be able to derive from the other: it is the same
 * `ImportMapping` that we show and send, whatever the screen.
 *
 * The preview is alive: the plan (`ImportMapping`) is in the state, and the tickets
 * are deduced from it. Three hands write it — header detection, model proposal, user corrections — and it's this same object that goes to the server. What we saw is what is imported.
 */
export function useCsvImport({
  projectId,
  initialFile,
  onImported,
  onPrepared,
}: {
  projectId: string;
  /** File already held by the caller — onboarding accepts the deposit on any
 * his card and opens the dialog with the CSV in hand. Parsed as if it came
 * from the drop zone: a single reading path. */
  initialFile?: File | null;
  onImported?: (result: ImportCommitResponse) => void;
  /** A file has just been analyzed — the wizard advances one step. */
  onPrepared?: () => void;
}) {
  const t = useTranslations("Settings");
  const queryClient = useQueryClient();
  const { categories } = useCategoriesQuery(projectId);
  const { members } = useMembersQuery(projectId, true);

  // What the project brings to the rapprochement. Recalculated when members or
  // the categories arrive, but the file is NOT read again: it is
  // the starting plan for a future repository.
  const context = useMemo<ImportContext>(
    () => ({
      members: members.map((m) => ({
        userId: m.user_id,
        email: m.email,
        name: m.full_name,
      })),
      categories: categories.map((c) => c.name),
      actorId: "",
    }),
    [members, categories]
  );
  const contextRef = useRef(context);
  contextRef.current = context;

  const [prepared, setPrepared] = useState<PreparedCsv | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [aiApplied, setAiApplied] = useState(false);
  const [aiPending, setAiPending] = useState(false);
  const [importing, setImporting] = useState(false);

  // A proposal that returns after the user has changed files (or
  // touched on the board) must not crush anything: we throw it away.
  const planRequestRef = useRef(0);

  // The advancement hook changes each time the caller renders: keep it
  // in a ref avoids remanufacturing `handleFile`, whose pilot identity
  // l'effet de lecture du fichier initial.
  const onPreparedRef = useRef(onPrepared);
  onPreparedRef.current = onPrepared;

  const reset = useCallback(() => {
    planRequestRef.current += 1;
    setPrepared(null);
    setMapping(null);
    setAiApplied(false);
    setAiPending(false);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_IMPORT_CSV_BYTES) {
        toast.error(t("importErrorTooLarge"));
        return;
      }
      const text = await file.text();
      const result = prepareImport(text, contextRef.current);
      if (!result.ok) {
        toast.error(
          result.error === "tooManyIssues"
            ? t("importErrorTooMany")
            : t("importErrorEmpty")
        );
        return;
      }
      const { table, stats, source, mapping: base } = result;

      setPrepared({
        fileName: file.name,
        csvText: text,
        table,
        stats,
        source,
        baseMapping: base,
      });
      setMapping(base);
      setAiApplied(false);
      onPreparedRef.current?.();

      // The model only passes if there is something left to gain: a
      // column that we did not know how to place, a value that we did not know how to translate,
      // a person we didn't recognize. A clean Linear export of a
      // project whose people we already know does not trigger any.
      if (!mappingHasGaps(stats, base, source)) return;

      const request = ++planRequestRef.current;
      setAiPending(true);
      const proposed = await fetchImportMappingApi(
        projectId,
        buildCsvDigest(stats, base, contextRef.current, table.rows.length)
      );
      if (request !== planRequestRef.current) return;
      setAiPending(false);
      if (!proposed) return;

      setMapping(
        mergeMapping(base, proposed, {
          // On a Linear or Jira export, the headers are those, exactly, of a
          // known format: the model only fills the holes. On a CSV
          // whatever it decides, because it has read the values.
          columnsWin: source === "csv",
        })
      );
      setAiApplied(true);
    },
    [projectId, t]
  );

  // A file entrusted by the caller is analyzed once, to the identity of
  // the `File` object: without the mark, each rendering would restart reading and
  // would erase the preview we just obtained.
  const handledFileRef = useRef<File | null>(null);
  useEffect(() => {
    if (!initialFile || handledFileRef.current === initialFile) return;
    handledFileRef.current = initialFile;
    void handleFile(initialFile);
  }, [initialFile, handleFile]);

  // The tickets are REDUCED from the plan: each retouching of the table of
  // match updates counts, warnings and button.
  const preview = useMemo(() => {
    if (!prepared || !mapping) return null;
    return issuesFromMapping(prepared.table, mapping);
  }, [prepared, mapping]);

  const changeMapping = useCallback((next: ImportMapping) => {
    // A correction by hand closes the game: the proposition in flight must not
    // nothing overwrite anymore.
    planRequestRef.current += 1;
    setAiPending(false);
    setMapping(next);
  }, []);

  const resetMapping = useCallback(() => {
    if (!prepared) return;
    planRequestRef.current += 1;
    setAiPending(false);
    setAiApplied(false);
    setMapping(prepared.baseMapping);
  }, [prepared]);

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

  const runImport = useCallback(async () => {
    if (!prepared || !mapping || importing) return;
    setImporting(true);
    try {
      const result = await importIssuesApi(projectId, prepared.csvText, mapping);
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
  }, [prepared, mapping, importing, projectId, t, queryClient, reset, onImported]);

  return {
    context,
    categories,
    prepared,
    mapping,
    preview,
    aiApplied,
    aiPending,
    importing,
    statusCounts,
    newCategoryCount,
    /** Without a title column, there is no ticket to create. */
    hasTitleColumn: mapping?.columns.includes("title") ?? false,
    /** The plan displayed is no longer that of detection: “reset” makes sense. */
    mappingTouched: !!prepared && mapping !== prepared.baseMapping,
    handleFile,
    reset,
    changeMapping,
    resetMapping,
    runImport,
  };
}
