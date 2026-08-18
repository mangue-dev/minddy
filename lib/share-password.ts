/**
 * The minimum length of a share password (MIN-347) — isomorphic.
 *
 * The server enforces it ([lib/server/view-shares.ts](server/view-shares.ts)),
 * both dialogs say it before sending. A single value for both:
 * a form more permissive than the server only produces a refusal that one
 * had not announced.
 *
 * The accompanying text (`passwordMinHint`) carries the number in all
 * letters — a placeholder message called without its values displays the path
 * of its key, and nothing here justifies taking this risk for an 8.
 */
export const MIN_SHARE_PASSWORD_LENGTH = 8;
