import { ISSUE_EFFORTS, ISSUE_PRIORITIES, ISSUE_STATUSES } from "@/lib/issue-validation";

const SMART_FILLED_FIELDS = ["priority", "effort", "objective_id", "category_ids"] as const;

const UPDATE_DRAFT_TOOL = {
  type: "function" as const,
  function: {
    name: "update_draft",
    description:
      "Apply changes to the issue draft form. Only pass the fields to change — omitted fields keep their current value. category_ids REPLACES the full set.",
    parameters: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Concise issue title (Linear-style, ≤ 80 chars)." },
        description: { type: "string", description: "Issue description, markdown." },
        status: { type: "string", enum: [...ISSUE_STATUSES] },
        priority: { type: "string", enum: [...ISSUE_PRIORITIES] },
        effort: {
          type: ["string", "null"],
          enum: [...ISSUE_EFFORTS, null],
          description: "Effort estimate (t-shirt size), or null to clear.",
        },
        assignee_id: {
          type: ["string", "null"],
          description: "user_id of the assignee (from Members), or null to unassign.",
        },
        objective_id: {
          type: ["string", "null"],
          description: "Objective id (from Objectives), or null to detach.",
        },
        due_date: {
          type: ["string", "null"],
          description:
            "Due date as a naive local datetime, no offset ('2026-07-10T00:00:00'), or null to clear.",
        },
        category_ids: {
          type: "array",
          items: { type: "string" },
          description: "The complete new set of category ids (from Categories).",
        },
      },
    },
  },
};

/** Returns the tool schema exposed to dictation, excluding smart-filled fields. */
export function updateDraftTool(smartFill: boolean) {
  if (!smartFill) return UPDATE_DRAFT_TOOL;
  const properties = { ...UPDATE_DRAFT_TOOL.function.parameters.properties } as Record<
    string,
    unknown
  >;
  for (const field of SMART_FILLED_FIELDS) delete properties[field];
  return {
    ...UPDATE_DRAFT_TOOL,
    function: {
      ...UPDATE_DRAFT_TOOL.function,
      parameters: { ...UPDATE_DRAFT_TOOL.function.parameters, properties },
    },
  };
}
