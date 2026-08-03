"use client";

import type { SeedProposal } from "@/lib/seed/types";
import { trackEvent } from "./analytics";

/** Ce que l'écriture de l'amorce rend — de quoi dire ce qui vient d'exister. */
export interface SeedCommitResponse {
  created: number;
  objectives_created: number;
  categories_created: number;
  sub_issues_linked: number;
}

/**
 * Demande la découpe d'un brief (MIN-172). Rien ne s'écrit : la réponse est une
 * PROPOSITION, que l'aperçu affiche et laisse corriger.
 *
 * Lève avec le message du serveur — contrairement à la proposition de
 * correspondance d'un import, cette passe EST la fonctionnalité : un échec
 * silencieux laisserait l'utilisateur devant un écran qui ne dit rien.
 */
export async function proposeBriefApi(
  projectId: string,
  brief: string
): Promise<SeedProposal | null> {
  trackEvent("brief_split_requested", { brief_length: brief.length });
  const proposal = await postJson<{ proposal: SeedProposal | null }>(
    `/api/projects/${projectId}/brief`,
    { brief }
  );
  if (proposal.proposal) {
    trackEvent("brief_split_proposed", {
      issue_count: proposal.proposal.issues.length,
      objective_count: proposal.proposal.objectives.length,
    });
  }
  return proposal.proposal;
}

/** POST la proposition TELLE QUE L'APERÇU LA MONTRE — décochages et titres
 *  réécrits compris. Le serveur la revalide en entier avant d'écrire. */
export async function applyBriefApi(
  projectId: string,
  proposal: SeedProposal
): Promise<SeedCommitResponse> {
  const result = await postJson<SeedCommitResponse>(
    `/api/projects/${projectId}/brief/apply`,
    { proposal }
  );
  trackEvent("brief_split_applied", {
    issue_count: result.created,
    objective_count: result.objectives_created,
  });
  return result;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  if (data == null) throw new Error("Empty response");
  return data as T;
}
