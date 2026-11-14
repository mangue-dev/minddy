import {
  isAiInstructionUseCase,
  normalizeAiInstruction,
  type AiInstructionUseCase,
} from "@/lib/ai-instructions";

/**
 * An instruction minddy proposes after people repeatedly corrected what
 * Smart Fill or Smart Assign had set (MIN-988). Nothing changes until the
 * project's owner accepts it; they may edit the text first.
 */

/** The issue fields whose corrections can lead to a proposal. */
export const AI_CORRECTION_FIELDS = [
  "title", "priority", "effort", "categories", "objective_id", "assignee_id",
] as const;
export type AiCorrectionField = (typeof AI_CORRECTION_FIELDS)[number];

/** The instruction a corrected field would change. */
export const AI_CORRECTION_USE_CASE: Record<AiCorrectionField, AiInstructionUseCase> = {
  title: "title",
  priority: "properties",
  effort: "properties",
  categories: "properties",
  objective_id: "objectives",
  assignee_id: "assign",
};

export function isAiCorrectionField(value: unknown): value is AiCorrectionField {
  return (AI_CORRECTION_FIELDS as readonly unknown[]).includes(value);
}

export interface AiInstructionProposal {
  id: string;
  project_id: string;
  use_case: AiInstructionUseCase;
  field: AiCorrectionField;
  /** Corrected issues the proposal was drafted from. */
  correction_count: number;
  /** The whole instruction the use case would have once accepted. */
  instruction: string;
  /** One sentence saying what minddy noticed. */
  observation: string;
  created_at: string;
}

/** A proposal as the API returns it, or `null` when the payload is not one. */
export function parseAiInstructionProposal(value: unknown): AiInstructionProposal | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const instruction = normalizeAiInstruction(row.instruction);
  if (typeof row.id !== "string" || typeof row.project_id !== "string" ||
      !isAiInstructionUseCase(row.use_case) || !isAiCorrectionField(row.field) ||
      !instruction || typeof row.observation !== "string" ||
      typeof row.created_at !== "string") {
    return null;
  }
  return {
    id: row.id,
    project_id: row.project_id,
    use_case: row.use_case,
    field: row.field,
    correction_count: typeof row.correction_count === "number" ? row.correction_count : 0,
    instruction,
    observation: row.observation,
    created_at: row.created_at,
  };
}
