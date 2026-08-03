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
 * La DEMANDE de découpe n'est plus une route du navigateur (MIN-173) : un brief
 * n'est plus un formulaire qu'une passe traite dans son coin, c'est le premier
 * message d'une conversation, et c'est Numo qui appelle la fabrique
 * (`propose_backlog`, `lib/server/assistant/execute-tool.ts`). Il ne reste ici
 * que l'ÉCRITURE de ce que l'aperçu a fait valider — la même, quel que soit
 * l'écran qui l'a montré.
 */

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
