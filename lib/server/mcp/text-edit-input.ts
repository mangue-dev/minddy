import "server-only";

import { z } from "zod";
import { MAX_TEXT_EDITS, type TextPassageEdit } from "@/lib/server/text-edit";

/**
 * The passage-edit arguments shared by minddy_edit_issue_text and
 * minddy_edit_page_text: one `old_string` → `new_string`, then optionally more
 * of them in `edits`, applied in order and all or nothing. The first pair
 * stays required: a field outside `required` is one a small model leaves out.
 */
const OLD_STRING = z
  .string()
  .min(1)
  .describe(
    "The exact passage to replace, copied VERBATIM from the text the read tool " +
      "returned — whitespace and line breaks included.",
  );
const NEW_STRING = z
  .string()
  .describe("What replaces it. An empty string deletes the passage.");
const REPLACE_ALL = z
  .boolean()
  .optional()
  .describe(
    "Replace EVERY occurrence instead of requiring a unique match " +
      "(default false). Use it for a term repeated throughout the text.",
  );

export const TEXT_EDIT_FIELDS = {
  old_string: OLD_STRING,
  new_string: NEW_STRING,
  replace_all: REPLACE_ALL,
  edits: z
    .array(
      z.object({
        old_string: OLD_STRING,
        new_string: NEW_STRING,
        replace_all: REPLACE_ALL,
      }),
    )
    .min(1)
    .max(MAX_TEXT_EDITS - 1)
    .optional()
    .describe(
      "MORE replacements in the same call, after old_string → new_string: " +
        "applied in order, each on the result of the previous one, and all or " +
        "nothing — if one does not match, nothing is written and the refusal " +
        "names it (old_string → new_string is edit 1).",
    ),
};

export function readTextEdits(args: {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
  edits?: Array<{ old_string: string; new_string: string; replace_all?: boolean }>;
}): TextPassageEdit[] {
  return [args, ...(args.edits ?? [])].map((edit) => ({
    oldString: edit.old_string,
    newString: edit.new_string,
    replaceAll: edit.replace_all ?? false,
  }));
}

/** A list of replacements on its own, for a tool whose text is one field of many. */
export const TEXT_EDIT_LIST = z
  .array(
    z.object({
      old_string: OLD_STRING,
      new_string: NEW_STRING,
      replace_all: REPLACE_ALL,
    }),
  )
  .min(1)
  .max(MAX_TEXT_EDITS);

export function toPassageEdits(
  list: Array<{ old_string: string; new_string: string; replace_all?: boolean }>,
): TextPassageEdit[] {
  return list.map((edit) => ({
    oldString: edit.old_string,
    newString: edit.new_string,
    replaceAll: edit.replace_all ?? false,
  }));
}
