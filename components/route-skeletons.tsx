import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AppContentHeader } from "@/components/app-content-header";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { BoardLoadingSkeleton } from "@/components/board-loading-skeleton";

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
  emptyHeader = false,
}: {
  rows?: number;
  rowClassName?: string;
  cards?: number;
  /** Match detail panes whose structural header is intentionally blank. */
  emptyHeader?: boolean;
}) {
  return (
    <div className="flex h-full min-h-0">
      <SecondarySidebar hiddenOnMobile>
        <div className="flex flex-col gap-2 pt-2 pb-4">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className={`${rowClassName} rounded-lg`} />
          ))}
        </div>
      </SecondarySidebar>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {emptyHeader ? (
          <AppContentHeader />
        ) : (
          <div className="shrink-0 px-4 py-3 app-desktop:px-6">
            <Skeleton className="h-8 w-48" />
          </div>
        )}
        <div
          className={cn(
            "min-h-0 flex-1 px-4 pt-1 pb-8 app-desktop:px-6",
            emptyHeader && "app-desktop:pt-6",
          )}
        >
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
      <SecondarySidebar hiddenOnMobile>
        <div className="flex flex-col gap-1.5 pt-2 pb-4">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center">
              <div style={{ width: indents[i % indents.length] }} />
              <Skeleton className="h-6 flex-1 rounded-md" />
            </div>
          ))}
        </div>
      </SecondarySidebar>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PageDocumentSkeleton />
      </div>
    </div>
  );
}

/** The icon row's reserved place and the title block of a page header
 *  (components/pages/page-header.tsx), as measured on a loaded page. */
function PageTitleSkeleton({ titleWidth = "w-2/3" }: { titleWidth?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div aria-hidden className="h-7 pointer-coarse:h-9" />
      <div className="h-[2.875rem] pt-1 app-desktop:h-[3.1875rem] app-desktop:pt-[5px]">
        <Skeleton className={cn("h-8 app-desktop:h-9", titleWidth)} />
      </div>
    </div>
  );
}

/**
 * A page's document while it loads, on the page view's own geometry
 * (components/pages/page-view.tsx, page-header.tsx), measured against a
 * loaded page: the content header, then the document column — its insets,
 * the icon row's reserved 28px, the title block (51px on desktop, its text
 * centered 5px lower than the block's top edge would put it) and body lines
 * every 26px. No breadcrumb or icon placeholder: a top-level page has no
 * breadcrumb and a page without an icon shows nothing in that row. The route segment and the page view both show it, so the
 * hand-off between them and to the page does not move. `panel`: the side
 * page panel, which has its own header and narrower insets.
 */
export function PageDocumentSkeleton({ panel = false }: { panel?: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!panel && <AppContentHeader contentClassName="gap-2"><span /></AppContentHeader>}
      <div
        className={cn(
          "relative mx-auto w-full max-w-3xl px-6 py-10",
          panel ? "app-desktop:px-16" : "app-desktop:pl-24 app-desktop:pr-10"
        )}
      >
        <PageTitleSkeleton />
        <div className="mt-6 flex flex-col">
          {["w-full", "w-11/12", "w-4/5", "w-2/3"].map((width) => (
            <div key={width} className="flex h-[1.625rem] items-center">
              <Skeleton className={cn("h-4", width)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * A database page while it loads, on the measured geometry of a loaded one
 * (components/pages/page-view.tsx, page-database-view.tsx): the page title,
 * then 20px below it the views bar (the view pills on the left; filter, sort,
 * search, settings and the New pill on the right), then the table 4px lower,
 * reaching the pane's edges on desktop like the real one, with its 41px
 * header and rows and the New entry line. `panel`: the side page panel.
 */
export function DatabaseSkeleton({ panel = false }: { panel?: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!panel && <AppContentHeader contentClassName="gap-2"><span /></AppContentHeader>}
      <div
        className={cn(
          "relative mx-auto w-full px-6 py-10",
          panel ? "max-w-3xl app-desktop:pl-24 app-desktop:pr-16" : "max-w-none app-desktop:pl-24 app-desktop:pr-10"
        )}
      >
        {/* A database spans the pane: a share of it would be far longer than
            any title. */}
        <PageTitleSkeleton titleWidth="w-72 max-w-2/3" />
        <div className="mt-5 flex h-8 items-center gap-2">
          <Skeleton className="h-7 w-14 rounded-full" />
          <Skeleton className="size-5 rounded-md" />
          <div className="ml-auto flex items-center gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="size-5 rounded-md" />
            ))}
            <Skeleton className="ml-1 h-8 w-12 rounded-full" />
          </div>
        </div>
        <div className={cn("mt-1", panel ? "app-desktop:-mr-16 app-desktop:-ml-24" : "app-desktop:-mr-10 app-desktop:-ml-24")}>
          <div className="flex h-[41px] items-center border-b border-border/50 pl-3 app-desktop:pl-[108px]">
            <Skeleton className="h-3.5 w-12" />
          </div>
          {["w-40", "w-32", "w-36"].map((width) => (
            <div key={width} className="flex h-[41px] items-center gap-2 border-b border-border/50 pl-2.5 app-desktop:pl-[106px]">
              <Skeleton className="size-4 rounded-sm" />
              <Skeleton className={cn("h-4", width)} />
            </div>
          ))}
          <div className="flex h-10 items-center pl-3 app-desktop:pl-[108px]">
            <Skeleton className="h-3.5 w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Settings (MIN-167): the template above, with miter lines. */
export function SettingsPageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ListDetailSkeleton
      rows={6}
      rowClassName="h-10"
      cards={rows}
      emptyHeader
    />
  );
}

/** Route-level board loading uses the same complete frame as data loading. */
export function BoardSkeleton({
  columns = 4,
  specialView = false,
}: {
  columns?: number;
  specialView?: boolean;
}) {
  return <BoardLoadingSkeleton columns={columns} specialView={specialView} />;
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
