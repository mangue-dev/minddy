/**
 * Bounds of a legitimate FAQ ask-box question (MIN-590, MIN-597): long enough
 * to be one, short enough to stay one. Shared by the client input
 * (`components/marketing/faq-ask.tsx`, `maxLength`) and the server
 * sanitizer (`lib/server/faq-answer.ts`) so the two limits cannot drift.
 */
export const MIN_QUESTION_CHARS = 8;
export const MAX_QUESTION_CHARS = 500;
