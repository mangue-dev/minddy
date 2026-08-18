// Bring together what the file NAMES and what the project CONTAINS: the
// people with its members, labels with its categories.
//
// Both meet the same need, and fail in the same way when we don't
// doesn't do them: an import that doesn't recognize anyone returns an entire backlog no
// assigned, and an import which does not recognize any double label every
// project categories (“Bugs” next to “Bug”, “front” next to
// “Frontend”). In both cases the file was correct, and Minddy put it away.
// side.
//
// This module only does the CERTAIN reconciliation — an equality, on case, on
// accents and separators. What requires a judgment (“Mr. Dupont” and
// “Marie Dupont”, “UI/UX” and “Design”) is left to the model, who receives
// the members and categories of the project in its summary. Isomorph: the overview
// and the commit approximate the same.

import { normalizeToken } from "@/lib/import/normalize";
import type { ImportMember } from "@/lib/import/types";

/** Like `normalizeToken`, but the punctuation also separates the words:
 * “Dupont, Marie” and “marie.dupont” become comparable. */
const nameToken = (value: string): string =>
  normalizeToken(value.replace(/[.,;/\\|<>()[\]{}+_-]+/g, " "));

/** The keys under which a member responds: email, local part, name. */
function memberKeys(member: ImportMember): string[] {
  const keys: string[] = [];
  const email = member.email?.trim().toLowerCase();
  if (email) {
    keys.push(email);
    const local = email.split("@")[0];
    if (local) keys.push(nameToken(local));
  }
  const name = member.name?.trim();
  if (name) {
    const token = nameToken(name);
    keys.push(token);
    // “Dupont Marie” for a file that reverses (Jira export sorted by name).
    const parts = token.split(" ");
    if (parts.length === 2) keys.push(`${parts[1]} ${parts[0]}`);
  }
  return keys;
}

/** Member index, built once per import. */
export function buildMemberIndex(members: ImportMember[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const member of members) {
    for (const key of memberKeys(member)) {
      // First come, first served: two members who respond to the same
      // key are ambiguous, and the second must not steal the first.
      if (key && !index.has(key)) index.set(key, member.userId);
    }
  }
  return index;
}

/** The identifier of the member that this value designates, or `null`. */
export function matchMember(raw: string, index: Map<string, string>): string | null {
  const value = raw.trim();
  if (!value) return null;
  return index.get(value.toLowerCase()) ?? index.get(nameToken(value)) ?? null;
}

// ── Categories ─────────────────────────────── ────────────────────────────────

/** A naive plural, sufficient for “Bugs” → “Bug” and “Feature” → “Features”. */
const singular = (token: string): string =>
  token.endsWith("s") && token.length > 3 ? token.slice(0, -1) : token;

/** Index of existing categories: token → exact name as it is in base. */
export function buildCategoryIndex(categories: string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const name of categories) {
    const token = nameToken(name);
    if (!token) continue;
    if (!index.has(token)) index.set(token, name);
    const stem = singular(token);
    if (stem && !index.has(stem)) index.set(stem, name);
  }
  return index;
}

/**
 * The name of the EXISTING category that this label designates, or `null` if
 * will need to be created. We only approximate the certainty: equality with accents,
 * except for case, separators and plural.
 */
export function matchCategory(raw: string, index: Map<string, string>): string | null {
  const token = nameToken(raw);
  if (!token) return null;
  return index.get(token) ?? index.get(singular(token)) ?? null;
}
