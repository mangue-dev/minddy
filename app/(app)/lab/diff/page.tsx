import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DiffLabClient } from "./lab-client";

export const metadata: Metadata = { title: "Banc d'essai — diffs" };

/**
 * BANC D'ESSAI des libs de rendu de diff — page de DÉVELOPPEMENT, 404 en
 * production. À supprimer (avec `fixture.json` et `diff-view-alt.tsx`) une fois
 * la lib tranchée.
 *
 * Ce que la comparaison cherche : le rendu du diff seul — coloration, densité,
 * alignement, lisibilité des couleurs d'ajout et de retrait dans les deux
 * thèmes. Ce qu'elle NE dit pas, et qui pèse tout autant dans la décision : la
 * vue de gauche porte déjà l'ancrage des commentaires de review, le dépliage du
 * contexte masqué et les widgets de ligne ; la vue de droite ne les a pas, et
 * les recâbler sur son API est le vrai coût d'une bascule.
 *
 *   /lab/diff            → jeu figé, extrait de vrais commits de minddy
 *   /lab/diff?pr=<id>    → une vraie pull request
 */
export default async function DiffLabPage({
  searchParams,
}: {
  searchParams: Promise<{ pr?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { pr } = await searchParams;
  return <DiffLabClient prId={pr} />;
}
