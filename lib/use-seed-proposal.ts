"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "mangue-ui";
import { applyBriefApi, type SeedCommitResponse } from "@/lib/seed-api";
import type { SeedProposal } from "@/lib/seed/types";

/**
 * L'aperçu VIVANT d'une proposition d'amorce : ce qui est décoché, les titres
 * réécrits, et l'écriture de ce que l'écran montre.
 *
 * Une seule fabrique pour les deux entrées du mode « nouveau projet » — la
 * modale du board, qui part d'un brief collé (MIN-172), et la carte du fil de
 * Numo, qui part de la conversation (MIN-173). Elles n'ont en commun ni leur
 * surface ni leur déclencheur, mais exactement le même geste : cocher, corriger,
 * créer. Le dupliquer, c'est se réveiller un jour avec deux règles différentes
 * sur ce qu'un objectif décoché emporte avec lui.
 */
export function useSeedProposal(projectId: string) {
  const t = useTranslations("Seed");
  const queryClient = useQueryClient();

  const [proposal, setProposalState] = useState<SeedProposal | null>(null);
  /** Les tickets décochés — l'exclusion se dit, la sélection se déduit. */
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  /** Poser (ou retirer) la proposition à relire. Repart d'une sélection pleine :
   *  les décochages d'une proposition précédente ne veulent plus rien dire. */
  const setProposal = useCallback((next: SeedProposal | null) => {
    setProposalState(next);
    setExcluded(new Set());
  }, []);

  const toggle = useCallback((keys: string[], next: boolean) => {
    setExcluded((prev) => {
      const set = new Set(prev);
      for (const key of keys) {
        if (next) set.delete(key);
        else set.add(key);
      }
      return set;
    });
  }, []);

  const rename = useCallback((key: string, title: string) => {
    setProposalState((prev) =>
      prev
        ? {
            ...prev,
            issues: prev.issues.map((issue) =>
              issue.key === key ? { ...issue, title } : issue
            ),
          }
        : prev
    );
  }, []);

  const selectedCount = useMemo(
    () =>
      proposal
        ? proposal.issues.filter((issue) => !excluded.has(issue.key)).length
        : 0,
    [proposal, excluded]
  );

  /**
   * Écrit ce que l'aperçu montre, et rien d'autre. Rend le compte rendu du
   * serveur, ou `null` quand rien n'a été écrit (échec dit en toast) — c'est à
   * l'appelant de décider ce que sa surface fait ensuite.
   */
  const create = useCallback(async (): Promise<SeedCommitResponse | null> => {
    if (!proposal || creating) return null;
    // Les tickets cochés, et les objectifs qu'il reste au moins un ticket pour
    // peupler : un chantier vide n'est pas un chantier.
    const issues = proposal.issues.filter((issue) => !excluded.has(issue.key));
    if (issues.length === 0) return null;
    const keptKeys = new Set(issues.map((issue) => issue.objectiveKey));
    const payload: SeedProposal = {
      objectives: proposal.objectives.filter((o) => keptKeys.has(o.key)),
      issues,
    };

    setCreating(true);
    try {
      const result = await applyBriefApi(projectId, payload);
      toast.success(t("createdToast", { count: result.created }));
      void queryClient.invalidateQueries({ queryKey: ["issues", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["objectives", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["categories", projectId] });
      return result;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setCreating(false);
    }
  }, [proposal, excluded, creating, projectId, queryClient, t]);

  return {
    proposal,
    setProposal,
    excluded,
    toggle,
    rename,
    selectedCount,
    creating,
    create,
  };
}
