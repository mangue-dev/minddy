import { Skeleton } from "mangue-ui";

// Squelette de la home. Calqué sur app/(app)/home/page.tsx : salutation +
// bouton, composer Numo, puis UNE section de liste — mêmes largeurs et mêmes
// gouttières, pour que le passage au vrai contenu ne déplace rien.
//
// Une seule section, et pas la pile entière : sur cette page, toutes les files
// s'effacent quand elles sont vides, et c'est le cas le plus fréquent. Un
// squelette qui promet quatre blocs pour n'en tenir qu'un secoue la page plus
// qu'il ne l'annonce.
export default function HomeLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Composer « Demander à Numo ». */}
      <Skeleton className="h-24 rounded-xl" />

      <div className="mt-8 flex flex-col gap-2.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}
