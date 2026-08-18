/**
 * Resolution of demo accounts, shared by all seed scripts.
 *
 * The scripts manipulate short keys (`camille`, `alice`, `tom`) and do not
 * never paste a hard identifier: they are resolved at each execution
 * from the ground up, making seeds replayable even after a replay
 * from the demo world.
 */

/** Short key → email. All follow the pattern recognized by the guardrails. */
export const PEOPLE = {
  camille: "captures-demo@minddy.app",
  alice: "captures-demo+alice@minddy.app",
  tom: "captures-demo+tom@minddy.app",
};

/** Name displayed, for summaries readable in French. */
export const PEOPLE_NAMES = {
  camille: "Camille Roy",
  alice: "Alice Fontaine",
  tom: "Tom Berger",
};

/** Resolves demo family emails to account IDs. */
export function resolvePeople(world) {
  const byEmail = new Map(world.demoUsers.map((u) => [u.email, u.id]));
  const ids = {};
  for (const [key, email] of Object.entries(PEOPLE)) {
    const id = byEmail.get(email);
    if (!id) {
      throw new Error(
        `captures: le compte ${email} n'existe pas. Lance d'abord 001-comptes.mjs.`,
      );
    }
    ids[key] = id;
  }
  return ids;
}

/** Find a demo project by its key (AUR, BCN, etc.). */
export function requireProject(world, key) {
  const project = world.demoProjects.find((p) => p.key === key && !p.deleted_at);
  if (!project) {
    throw new Error(
      `captures: le projet ${key} n'existe pas dans le monde de démo. ` +
        `Lance d'abord le script qui le crée.`,
    );
  }
  return project;
}
