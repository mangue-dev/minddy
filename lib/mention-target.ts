// Où mène une mention — la règle, en un seul endroit.
//
// Une pilule « @ » DÉSIGNE quelque chose : un ticket, un objectif, une page du
// wiki, un projet. Cliquer dessus doit y aller, exactement comme un lien du
// texte. Une personne, elle, ne mène nulle part : minddy n'a pas de page de
// profil, et une pilule qui se clique sans rien ouvrir ment sur ce qu'elle est.
//
// Les chemins sont les mêmes que ceux d'une notification
// (lib/notification-target.ts) : un ticket s'ouvre en panneau sur le board de
// son projet, un objectif se sélectionne sur la liste des objectifs. Deux
// entrées vers les mêmes écrans, une seule forme d'URL.
//
// Module PUR : pas de React, pas de `server-only` — de quoi le tester sans rien
// monter, et le lire depuis n'importe quelle surface.

/** Ce qu'une mention peut désigner (cf. components/mention-chip.tsx). */
export type MentionTargetType =
  | "member"
  | "project"
  | "numo"
  | "forge"
  | "issue"
  | "objective"
  | "page";

/**
 * Le chemin qu'ouvre une mention, ou `null` quand elle ne mène nulle part.
 *
 * `null` couvre deux cas qu'il ne faut pas confondre à l'appel :
 *  - une mention qui n'a PAS de destination (une personne, Numo, un compte de
 *    forge) — il n'y en aura jamais ;
 *  - un ticket, un objectif ou une page dont on ne connaît pas le projet — la
 *    résolution n'a pas (encore) abouti, la pilule reste inerte plutôt que de
 *    fabriquer une URL fausse.
 */
export function mentionTargetPath(
  type: MentionTargetType,
  id: string,
  projectId?: string | null,
): string | null {
  // Un projet se désigne par lui-même : son id EST celui de sa destination, il
  // n'y a rien à résoudre.
  if (type === "project") return id ? `/projects/${id}` : null;
  if (!id || !projectId) return null;
  switch (type) {
    case "issue":
      return `/projects/${projectId}?issue=${id}`;
    case "objective":
      return `/projects/${projectId}/objectives?open=${id}`;
    case "page":
      return `/projects/${projectId}/pages/${id}`;
    default:
      // member, numo, forge : personne n'a d'écran à ouvrir.
      return null;
  }
}

/** Ce qu'il faut savoir d'un élément citable pour retrouver son projet. */
interface MentionRow {
  id: string;
  project_id: string;
}

/**
 * De quel projet relève l'élément cité — le chaînon manquant entre la pilule,
 * qui ne porte que le type et l'id (components/mention-node.ts), et l'URL de
 * son écran, qui commence par le projet.
 *
 * Une seule table pour les trois natures, à clé composée : deux entités de
 * types différents peuvent porter le même id sans se marcher dessus, et un id
 * inconnu rend `undefined` — la pilule reste alors du texte.
 */
export function mentionProjectLookup(sources: {
  issues?: MentionRow[];
  objectives?: MentionRow[];
  pages?: MentionRow[];
}): (type: MentionTargetType, id: string) => string | undefined {
  const byKey = new Map<string, string>();
  for (const issue of sources.issues ?? []) {
    byKey.set(`issue:${issue.id}`, issue.project_id);
  }
  for (const objective of sources.objectives ?? []) {
    byKey.set(`objective:${objective.id}`, objective.project_id);
  }
  for (const page of sources.pages ?? []) {
    byKey.set(`page:${page.id}`, page.project_id);
  }
  return (type, id) => byKey.get(`${type}:${id}`);
}
