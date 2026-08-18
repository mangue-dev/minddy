import { Skeleton } from "mangue-ui";
import { SecondarySidebar } from "@/components/secondary-sidebar";

/**
 * Segment skeletons (MIN-89).
 *
 * The app is fully rendered client-side: without `loading.tsx`, a route transition
 * paints NOTHING until the client component is mounted and its own skeletons are not mounted. do not appear. These components fill exactly this
 * gap, and are intentionally modeled after the actual layout — a
 * skeleton that doesn't fall in the right place produces a hydration jump,
 * which is worse than the blank screen it replaces.
 *
 * Server Components: no "use client" here, `Skeleton` is a simple <div>.
 */

/** Two families of templates in the app: centered document page, and full-screen board. */
type DocWidth = "3xl" | "5xl";

const MAX_W: Record<DocWidth, string> = {
  "3xl": "max-w-3xl",
  "5xl": "max-w-5xl",
};

/**
 * Document page: title then stacked blocks. Resumes
 * `mx-auto w-full max-w-Nxl px-6 py-10` of the affected pages.
 */
export function DocPageSkeleton({
  width = "5xl",
  rows = 3,
  rowClassName = "h-24",
}: {
  width?: DocWidth;
  rows?: number;
  rowClassName?: string;
}) {
  return (
    <div className={`mx-auto w-full ${MAX_W[width]} px-6 py-10`}>
      <Skeleton className="mb-6 h-8 w-56" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className={`${rowClassName} rounded-xl`} />
        ))}
      </div>
    </div>
  );
}

/**
 * SECONDARY SIDEBAR screens: triage, returns, pull requests, agent sessions
 *, settings. A full height navigation column on the left, a
 * column of cards centered on the right.
 *
 * The skeleton mounts a REAL `SecondarySidebar`, not a column that looks like it
 *: this is the assembly that puts the primary bar to the rail. Without it, a
 * navigation to these screens would unfold the primary and close the gutter
 * during loading, to reopen everything when the screen arrives — a
 * round trip of 376 px over the entire right half.
 */
export function ListDetailSkeleton({
  rows = 6,
  rowClassName = "h-14",
  cards = 3,
}: {
  rows?: number;
  rowClassName?: string;
  cards?: number;
}) {
  return (
    <div className="flex h-full min-h-0">
      <SecondarySidebar>
        <div className="flex flex-col gap-2 px-2 pt-2 pb-4">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className={`${rowClassName} rounded-lg`} />
          ))}
        </div>
      </SecondarySidebar>
      <div className="hidden min-h-0 min-w-0 flex-1 flex-col md:flex">
        <div className="shrink-0 px-4 py-3 md:px-6">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="min-h-0 flex-1 px-4 pt-1 pb-8 md:px-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {Array.from({ length: cards }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The Pages tab (MIN-270): a TREE on the left, a document on the right.
 *
 * It does not reuse `ListDetailSkeleton` because the two halves differ
 * on both sides — a tree line is 28 px where a yard card en
 * is 56, and the right panel is a document (title then paragraphs),
 * not a stack of cards. A skeleton that doesn't fall in the right place produces
 * a jump at the screen, which is worse than nothing.
 *
 * The decreasing widths of the lines imitate titles of different lengths
 *: six identical bars read like a table, not like a
 * tree.
 */
export function PageTreeSkeleton({ rows = 7 }: { rows?: number }) {
  const indents = [0, 16, 16, 0, 16, 32, 0];
  return (
    <div className="flex h-full min-h-0">
      <SecondarySidebar>
        <div className="flex flex-col gap-1.5 px-2 pt-2 pb-4">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center">
              <div style={{ width: indents[i % indents.length] }} />
              <Skeleton className="h-6 flex-1 rounded-md" />
            </div>
          ))}
        </div>
      </SecondarySidebar>
      <div className="hidden min-h-0 min-w-0 flex-1 flex-col md:flex">
        <div className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10">
          <Skeleton className="size-12 rounded-lg" />
          <Skeleton className="mt-2 h-10 w-2/3" />
          <div className="mt-8 flex flex-col gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Settings (MIN-167): the template above, with miter lines. */
export function SettingsPageSkeleton({ rows = 3 }: { rows?: number }) {
  return <ListDetailSkeleton rows={6} rowClassName="h-10" cards={rows} />;
}

/**
 * Kanban board: toolbar then columns. Takes the full structure
 * height of `app/(app)/projects/[id]/page.tsx` (`flex h-full flex-col`, then
 * `min-h-0 flex-1 px-6 pt-4`) so that the switch to the real board does not move
 * neither the toolbar nor the top of the columns.
 */
export function BoardSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-6 pt-4">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
      <div className="min-h-0 flex-1 px-6 pt-4">
        <div className="flex h-full gap-4 overflow-hidden">
          {Array.from({ length: columns }).map((_, col) => (
            <div key={col} className="flex min-w-[260px] flex-1 flex-col gap-3">
              <Skeleton className="h-5 w-28" />
              {/* Decreasing columns: a wall of identical cards reads like a
 display bug, not a loading. */}
              {Array.from({ length: Math.max(1, 4 - col) }).map((_, card) => (
                <Skeleton key={card} className="h-24 rounded-xl" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Full height page with centered content (objectives, sorting):
 * `min-h-0 flex-1 overflow-y-auto px-6 py-8` + `mx-auto max-w-5xl`.
 */
export function ScrollPageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <Skeleton className="mb-6 h-8 w-56" />
          <div className="flex flex-col gap-4">
            {Array.from({ length: rows }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
