import { Skeleton } from "mangue-ui";

// Squelette de la home. Calqué sur app/(app)/home/page.tsx : le bloc d'accueil,
// centré sur la hauteur de la FENÊTRE (d'où la gouttière basse à la hauteur du
// header) — salutation centrée, composer en dessous, dans la même colonne
// étroite. Mêmes rangées `1fr / auto / 1fr` : le composer tombe exactement là où
// le vrai se posera.
//
// Rien sous la ligne de flottaison : sur cette page, toutes les files s'effacent
// quand elles sont vides, et c'est le cas le plus fréquent. Un squelette qui
// promet des blocs pour n'en tenir aucun secoue la page plus qu'il ne l'annonce.
export default function HomeLoading() {
  return (
    <section className="grid min-h-full grid-rows-[1fr_auto_1fr] px-6 desktop:pb-[60px]">
      <div className="mx-auto flex w-full max-w-xl items-end pb-5 pt-10">
        <Skeleton className="mx-auto h-8 w-64" />
      </div>

      {/* Composer « Demander à Numo » — la surface, plus la gouttière verticale
          que le composer se donne (`py-3`). */}
      <div className="mx-auto w-full max-w-xl py-3">
        <Skeleton className="h-24 rounded-2xl" />
      </div>

      <div className="pb-10" />
    </section>
  );
}
