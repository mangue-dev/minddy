import { Skeleton } from "mangue-ui";

// Home skeleton. Modeled on app/(app)/home/page.tsx: the home block,
// centered on the height of the WINDOW (hence the low gutter at the height of the
// header) — centered salutation, compose below, in the same column
// narrow. Same rows `1fr / auto / 1fr`: the composer falls exactly where
// the real one will arise.
//
// Nothing below the fold: on this page, all lines disappear
// when they are empty, and this is the most frequent case. A skeleton that
// promises blocks to keep none shakes the page more than it announces.
export default function HomeLoading() {
  return (
    <section className="grid min-h-full grid-rows-[1fr_auto_1fr] px-6 desktop:pb-[60px]">
      <div className="mx-auto flex w-full max-w-xl items-end pb-5 pt-10">
        <Skeleton className="mx-auto h-8 w-64" />
      </div>

      {/* Dial “Ask Numo” — the surface area, plus the vertical gutter
 that the dial gives itself (`py-3`). */}
      <div className="mx-auto w-full max-w-xl py-3">
        <Skeleton className="h-24 rounded-2xl" />
      </div>

      <div className="pb-10" />
    </section>
  );
}
