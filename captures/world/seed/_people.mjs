/**
 * Résolution des comptes de démo, partagée par tous les scripts de seed.
 *
 * Les scripts manipulent des clés courtes (`camille`, `alice`, `tom`) et ne
 * collent jamais d'identifiant en dur : ils sont résolus à chaque exécution
 * depuis la base, ce qui rend les seeds rejouables même après une recréation
 * du monde de démo.
 */

/** Clé courte → email. Tous suivent le motif reconnu par les garde-fous. */
export const PEOPLE = {
  camille: "captures-demo@minddy.app",
  alice: "captures-demo+alice@minddy.app",
  tom: "captures-demo+tom@minddy.app",
};

/** Nom affiché, pour les résumés lisibles en français. */
export const PEOPLE_NAMES = {
  camille: "Camille Roy",
  alice: "Alice Fontaine",
  tom: "Tom Berger",
};

/** Résout les emails de la famille de démo en identifiants de comptes. */
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

/** Retrouve un projet de démo par sa clé (AUR, BCN…). */
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
