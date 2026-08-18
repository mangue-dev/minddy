"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "mangue-ui";
import { applyBriefApi, type SeedCommitResponse } from "@/lib/seed-api";
import type { SeedProposal } from "@/lib/seed/types";

/**
 * The LIVE preview of a starter proposal: what is unchecked, the titles
 * rewritten, and the writing of what the screen shows.
 *
 * A single factory for the two entries of the "new project" mode — the modal
 * of the board, which leaves of a pasted brief (MIN-172), and the thread map of
 * Numo, which starts from the conversation (MIN-173). They have neither their
 * surface nor their trigger in common, but exactly the same gesture: check, correct,
 * create. Duplicating it means waking up one day with two different rules
 * on what an unchecked goal takes with it.
 */
export function useSeedProposal(projectId: string) {
  const t = useTranslations("Seed");
  const queryClient = useQueryClient();

  const [proposal, setProposalState] = useState<SeedProposal | null>(null);
  /** Unchecked tickets — the exclusion is said, the selection is deduced. */
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  /** Add (or remove) the proposition to be reread. Starts from a full selection:
 * unchecking a previous proposition no longer means anything. */
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
 * Writes what the preview shows, and nothing else. Reports the
 * server, or `null` when nothing has been written (failure called toast) — it's up to
 * the caller to decide what its surface does next.
 */
  const create = useCallback(async (): Promise<SeedCommitResponse | null> => {
    if (!proposal || creating) return null;
    // Checked tickets, and the objectives that at least one ticket remains for
    // populate: an empty construction site is not a construction site.
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
