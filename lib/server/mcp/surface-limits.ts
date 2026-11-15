/**
 * Limits the MCP tools and Numo's tools share, so that both surfaces accept
 * and return the same amounts of the same objects.
 */

/** Issues, relations or pages one bulk call may touch. */
export const MAX_BULK_ISSUES = 50;

/** Per-file ceiling of a pull request diff in a pull request read. */
export const MAX_PATCH_CHARS = 4000;

/**
 * Ceiling of the diff a passage edit returns: enough to confirm the edit
 * landed in the right place, without carrying back the document the edit
 * avoided rewriting.
 */
export const MAX_EDIT_DIFF_CHARS = 2000;
