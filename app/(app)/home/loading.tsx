import { Skeleton } from "mangue-ui";

// Squelette de la home (MIN-89). Calqué sur app/(app)/home/page.tsx : salutation
// + bouton, composer Numo, les deux cartes de focus (cycle / pouls global), puis
// la grille de projets — mêmes largeurs et mêmes gouttières, pour que le passage
// au vrai contenu ne déplace rien.
const GRID_STYLE = {
  gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
  gridAutoRows: "1fr",
} as const;

export default function HomeLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Composer « Demander à Numo ». */}
      <Skeleton className="h-24 rounded-xl" />

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-[200px] rounded-xl" />
        <Skeleton className="h-[200px] rounded-xl" />
      </div>

      <Skeleton className="mb-4 mt-10 h-4 w-32" />
      <div className="grid gap-4" style={GRID_STYLE}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[160px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
