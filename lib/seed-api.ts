"use client";

import type { SeedProposal } from "@/lib/seed/types";
import { trackEvent } from "./analytics";

/** What the writing of the beginning renders — enough to say what has just existed. */
export interface SeedCommitResponse {
  created: number;
  objectives_created: number;
  categories_created: number;
  sub_issues_linked: number;
}

/**
 * The cutting REQUEST is no longer a navigator route (MIN-173): a brief
 * is no longer a form that a pass treats in its corner, it is the first
 * message from a conversation, and it's Numo who calls the factory
 * (`propose_backlog`, `lib/server/assistant/execute-tool.ts`). Il ne reste ici
 * that the WRITING of what the preview has validated — the same, whatever
 * the screen that showed it.
 */

/** POST the proposal AS THE PREVIEW SHOWS — unchecks and titles
 * rewritten included. The server completely revalidates it before writing. */
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
