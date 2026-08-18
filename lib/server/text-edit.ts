import { applyEdit, ReplaceError } from "@/lib/server/agent/edit";

/**
 * Edit IN PLACE a ticket text — plan or description (MIN-186).
 *
 * Updating three sentences of a 21,000 character plan cost, on the MCP side,
 * re-issuing the entire document: the only writing available replaced
 * everything. Hence this patch `old_string` → `new_string`, based on the model of the tool `Edit`
 * that every code agent knows.
 *
 * The engine is not new: it is that of the code agent code
 * ([lib/server/agent/edit.ts](edit.ts)), already proven on files, and pure.
 * This module only does two things that it cannot do: it refuses an empty
 * field, and it REWRITE refusals. The `replace()` posts talk about "the
 * file" and suggest `write_file` — a template that edits a ticket plan has neither on hand, and following that advice would send it straight to the total rewrite we're looking for to avoid.
 *
 * The counterpart of the patch is the real benefit: a complete rewrite silently overwrites
 * what another client has changed in the meantime, an outdated `old_string`
 * fails loudly.
 */

export type IssueTextField = "plan" | "description";

export interface IssueTextEditOk {
  ok: true;
  /** The complete field after editing, to be written as is. */
  content: string;
  /** Unified diff, common indentation removed. */
  diff: string;
  additions: number;
  deletions: number;
}

export interface IssueTextEditRefusal {
  ok: false;
  /** MCP error code (stable, in English, like the rest of the surface). */
  code: "invalid_params" | "text_not_found" | "text_ambiguous";
  message: string;
}

export type IssueTextEditResult = IssueTextEditOk | IssueTextEditRefusal;

/**
 * The tools of the calling surface, NAMED. Three surfaces serve this patch —
 * the MCP, the Numo chat, the code agent — and they do not name the same
 * tools: `minddy_get_issue` here, `get_issue` there, `read_issue` elsewhere.
 * A refusal message which sends to a tool absent from the surface, it's a
 * round burned on an “Unknown tool”. Hence this parameter, mandatory: there
 * is no reasonable default, only one set of names just per caller.
 */
export interface IssueTextTools {
  /** Which rereads the ticket — hence `old_string` must be copied. */
  read: string;
  /** Which ADDS a block to a plan. */
  appendToPlan: string;
  /** Which replaces the ENTIRE field, per field. */
  replaceWhole: Record<IssueTextField, string>;
}

/** What the model should do instead, when patching is not the way. */
const otherWay = (field: IssueTextField, tools: IssueTextTools): string =>
  field === "plan"
    ? `Use ${tools.appendToPlan} to ADD a block, or ${tools.replaceWhole.plan} to write the whole plan.`
    : `Use ${tools.replaceWhole.description} to write the whole description.`;

export function editIssueText({
  field,
  current,
  oldString,
  newString,
  replaceAll = false,
  tools,
}: {
  field: IssueTextField;
  /** The field as it is stored NOW ("" when there is none). */
  current: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
  tools: IssueTextTools;
}): IssueTextEditResult {
  return editTextPassage({
    field,
    current,
    oldString,
    newString,
    replaceAll,
    read: tools.read,
    otherWay: otherWay(field, tools),
    subject: "issue",
  });
}

/**
 * The same patch, for text that is NOT a ticket field — the body of a
 * page (MIN-273). Only the word that names the text and the advice of
 * change: the engine, the refusals and their codes are the same, and that's the point.
 * A page corrected by Numo must fail exactly like a plan corrected by
 * Numo, with the same error vocabulary on both sides.
 */
export function editTextPassage({
  field,
  current,
  oldString,
  newString,
  replaceAll = false,
  read,
  otherWay: fallback,
  subject = "issue",
}: {
  /** The word that names the text in messages: “plan”, “body”… */
  field: string;
  current: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
  /** The tool that rereads the text, from which `old_string` must be copied. */
  read: string;
  /** What to do instead when patching isn't the way. */
  otherWay: string;
  /** What the text says: “issue”, “page”. */
  subject?: string;
}): IssueTextEditResult {
  if (!current.trim()) {
    return {
      ok: false,
      code: "invalid_params",
      message:
        `This ${subject} has no ${field} yet, so there is nothing to patch. ` +
        fallback,
    };
  }
  try {
    const edit = applyEdit(`${field}.md`, current, oldString, newString, replaceAll);
    return {
      ok: true,
      content: edit.content,
      diff: edit.diff,
      additions: edit.additions,
      deletions: edit.deletions,
    };
  } catch (err) {
    if (!(err instanceof ReplaceError)) throw err;
    switch (err.reason) {
      case "identical":
        return {
          ok: false,
          code: "invalid_params",
          message: "old_string and new_string are identical — nothing to change.",
        };
      case "empty_old":
        return {
          ok: false,
          code: "invalid_params",
          message:
            `old_string cannot be empty: give the exact passage of the ${field} ` +
            `to replace. ${fallback}`,
        };
      case "not_found":
        return {
          ok: false,
          code: "text_not_found",
          message:
            `Could not find old_string in the ${field}. It must match the stored ` +
            `text exactly, whitespace included — read it again with ${read} ` +
            "and copy the passage verbatim (it may also have changed since you " +
            "last read it, which is exactly what this refusal protects).",
        };
      case "ambiguous":
        return {
          ok: false,
          code: "text_ambiguous",
          message:
            `old_string matches several passages of the ${field}. Include the ` +
            "surrounding lines to make the match unique, or set replace_all to " +
            "change every occurrence.",
        };
      case "disproportionate":
        return {
          ok: false,
          code: "invalid_params",
          message:
            "Refusing the edit: the matched passage is much larger than " +
            `old_string. Read the ${field} again with ${read} and copy the ` +
            "exact passage to replace.",
        };
    }
  }
}
