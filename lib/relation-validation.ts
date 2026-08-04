// Server-safe value list + validator for issue relations (MIN-25) — no
// React/lucide import, so route handlers and the assistant tool schemas can use
// it. lib/relation-constants.ts builds its icon/color metadata on top of it.
//
// Three types are SHOWN, two are stored: `blocked_by` is an incoming `blocks`
// (see normalizeRelation). This list is the picker's, i.e. what a caller may ask
// for, not what the table holds.

import type { IssueRelationType } from "./types";

export const RELATION_TYPE_VALUES = [
  "blocks",
  "blocked_by",
  "related",
] as const satisfies readonly IssueRelationType[];

export const isRelationType = (v: unknown): v is IssueRelationType =>
  typeof v === "string" && (RELATION_TYPE_VALUES as readonly string[]).includes(v);
