"use client";

/**
 * Sent once the creation form's request succeeded (MIN-907). With Smart
 * Fill the server writes the issue only after the model has filled it, so
 * the issue itself appears later; what counts for the getting-started steps
 * is that the person created one.
 */
export const ISSUE_SUBMITTED_EVENT = "minddy:issue-submitted";

export function announceIssueSubmitted() {
  window.dispatchEvent(new Event(ISSUE_SUBMITTED_EVENT));
}
