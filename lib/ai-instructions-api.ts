"use client";

import { normalizeAiInstructions, type AiInstructions } from "./ai-instructions";
import { parseAiInstructionProposal, type AiInstructionProposal } from "./ai-instruction-proposals";
import { apiErrorCode, HttpResponseError } from "./backend-availability";
import { fetchClientRead } from "./client-read";

/** Calls for a project's AI instructions and the proposals drafted from corrections (MIN-988). */

export const aiInstructionsKey = (projectId: string) => ["ai-instructions", projectId] as const;
export const AI_INSTRUCTION_PROPOSALS_KEY = ["me", "ai-instruction-proposals"] as const;

async function parse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new HttpResponseError(data?.error || "Request failed", response.status, apiErrorCode(data));
  }
  return data as T;
}

export interface ProjectAiInstructions {
  instructions: AiInstructions;
  /** The proposal waiting for the owner's answer; always null for a member. */
  proposal: AiInstructionProposal | null;
}

export async function fetchProjectAiInstructionsApi(projectId: string,
  signal?: AbortSignal): Promise<ProjectAiInstructions> {
  const data = await parse<{ instructions?: unknown; proposal?: unknown }>(
    await fetchClientRead(`/api/projects/${projectId}/ai-instructions`, { signal }));
  return {
    instructions: normalizeAiInstructions(data.instructions),
    proposal: parseAiInstructionProposal(data.proposal),
  };
}

export async function fetchAiInstructionProposalsApi(signal?: AbortSignal): Promise<AiInstructionProposal[]> {
  const data = await parse<{ proposals?: unknown[] }>(
    await fetchClientRead("/api/me/ai-instruction-proposals", { signal }));
  return (data.proposals ?? []).flatMap((item) => {
    const proposal = parseAiInstructionProposal(item);
    return proposal ? [proposal] : [];
  });
}

/** The owner's answer: accept the text they validated, or set the proposal aside. */
export async function resolveAiInstructionProposalApi(id: string,
  answer: { action: "accept"; instruction: string } | { action: "dismiss" }): Promise<void> {
  await parse(await fetch(`/api/ai-instruction-proposals/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(answer),
  }));
}
