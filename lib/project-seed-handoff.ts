"use client";

/**
 * What the creation wizard hands to the board he has just opened (MIN-171).
 *
 * The beginning is played AFTER creation: the wizard ends on
 * `/projects/{id}?setup=numo|import`, and the surface that opens there needs
 * what was entered one step earlier — the brief pasted, the CSV submitted.
 *
 * In memory, not in sessionStorage: a `File` is not serialized, and the
 * navigation is a client-side `router.push`, so the same JS context. A
 * complete restart (reload, link reopened later) loses the discount and the
 * surface opens empty — which is exactly what it should do when it
 * has not received anything (Numo then opens his questions, the import to his zone of
 * deposit).
 *
 * The shed is for SINGLE USE: the board takes it, it disappears. Otherwise the
 * The same brief would be re-proposed the next time I visit this board.
 */

export type SeedHandoff =
  /** The brief becomes the FIRST MESSAGE of a conversation with Numo
   * (MIN-173); `null` when the user preferred to start with their questions. */
  | { kind: "numo"; brief: string | null }
  | { kind: "import"; file: File };

let pending: SeedHandoff | null = null;

export function putSeedHandoff(handoff: SeedHandoff): void {
  pending = handoff;
}

/** The put back on hold, consumed: the next call returns `null`. */
export function takeSeedHandoff(): SeedHandoff | null {
  const handoff = pending;
  pending = null;
  return handoff;
}
