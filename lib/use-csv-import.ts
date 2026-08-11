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

/** Le fichier déposé, tel que l'aperçu le tient : lu une fois, relu jamais. */
export interface PreparedCsv {
  fileName: string;
  csvText: string;
  table: CsvTable;
  /** Le comptage des colonnes — recalculer à chaque retouche du tableau de
   *  correspondance se verrait à l'écran sur un fichier de 2 000 lignes. */
  stats: TableStats;
  source: ImportSource;
  /** Le plan de départ — ce vers quoi « réinitialiser » ramène. */
  baseMapping: ImportMapping;
}

/**
 * Le geste d'import (MIN-45), sans son écran : lire le fichier, en tirer un
 * plan de lecture, laisser le modèle combler les trous, redéduire l'aperçu à
 * chaque retouche, commiter.
 *
 * Extrait du panneau des réglages parce qu'il a maintenant DEUX surfaces — le
 * panneau inline et le wizard d'import (`import-wizard-dialog.tsx`) — et
 * qu'aucune des deux ne doit pouvoir dériver de l'autre : c'est le même
 * `ImportMapping` qu'on montre et qu'on envoie, quel que soit l'écran.
 *
 * L'aperçu est vivant : le plan (`ImportMapping`) est de l'état, et les tickets
 * s'en déduisent. Trois mains l'écrivent — la détection par en-têtes, la
 * proposition du modèle, les corrections de l'utilisateur — et c'est ce même
 * objet qui part au serveur. Ce qu'on a vu est ce qui est importé.
 */
export function useCsvImport({
  projectId,
  initialFile,
  onImported,
  onPrepared,
}: {
  projectId: string;
  /** Fichier déjà tenu par l'appelant — l'onboarding accepte le dépôt sur toute
   *  sa carte et ouvre le dialog avec le CSV en main. Analysé comme s'il venait
   *  de la zone de dépôt : un seul chemin de lecture. */
  initialFile?: File | null;
  onImported?: (result: ImportCommitResponse) => void;
  /** Un fichier vient d'être analysé — le wizard avance d'une étape. */
  onPrepared?: () => void;
}) {
  const t = useTranslations("Settings");
  const queryClient = useQueryClient();
  const { categories } = useCategoriesQuery(projectId);
  const { members } = useMembersQuery(projectId, true);

  // Ce que le projet apporte au rapprochement. Recalculé quand les membres ou
  // les catégories arrivent, mais le fichier n'est PAS relu pour autant : c'est
  // le plan de départ d'un prochain dépôt.
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

  // Une proposition qui revient après que l'utilisateur a changé de fichier (ou
  // touché au tableau) ne doit rien écraser : on la jette.
  const planRequestRef = useRef(0);

  // Le crochet d'avancement change à chaque rendu de l'appelant : le garder
  // dans une ref évite de refabriquer `handleFile`, dont l'identité pilote
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

      // La passe du modèle n'a lieu que s'il reste quelque chose à gagner : une
      // colonne qu'on n'a pas su placer, une valeur qu'on n'a pas su traduire,
      // une personne qu'on n'a pas reconnue. Un export Linear propre d'un
      // projet dont on connaît déjà les gens n'en déclenche aucune.
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
          // Sur un export Linear ou Jira, les en-têtes sont ceux, exacts, d'un
          // format connu : le modèle ne comble que les trous. Sur un CSV
          // quelconque il tranche, parce qu'il a lu les valeurs.
          columnsWin: source === "csv",
        })
      );
      setAiApplied(true);
    },
    [projectId, t]
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

  // Les tickets se REDÉDUISENT du plan : chaque retouche du tableau de
  // correspondance met à jour les comptes, les avertissements et le bouton.
  const preview = useMemo(() => {
    if (!prepared || !mapping) return null;
    return issuesFromMapping(prepared.table, mapping);
  }, [prepared, mapping]);

  const changeMapping = useCallback((next: ImportMapping) => {
    // Une correction à la main clôt la partie : la proposition en vol ne doit
    // plus rien écraser.
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
    /** Sans colonne de titre, il n'y a pas de ticket à fabriquer. */
    hasTitleColumn: mapping?.columns.includes("title") ?? false,
    /** Le plan affiché n'est plus celui de la détection : « réinitialiser » a un sens. */
    mappingTouched: !!prepared && mapping !== prepared.baseMapping,
    handleFile,
    reset,
    changeMapping,
    resetMapping,
    runImport,
  };
}
