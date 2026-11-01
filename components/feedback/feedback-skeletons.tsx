import { AppContentHeader } from "@/components/app-content-header";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The Feedback tab while it loads, on the geometry of the loaded screen
 * (components/feedback/feedback-team-page.tsx): the column of posts on the
 * left, the opened post on the right. The route segment, the column and the
 * detail pane all render these pieces, so each hand-off lands every block
 * where its placeholder stood instead of jumping from generic cards.
 *
 * No "use client": `Skeleton` is a plain <div>.
 */

/** Title widths of the column's rows: titles of different lengths, not a table. */
const ROW_TITLE_WIDTHS = ["w-4/5", "w-3/5", "w-11/12", "w-2/3", "w-3/4", "w-1/2"];

/**
 * The column's rows (`FeedbackRow`): the same `gap-1 pt-2 pb-4` list and
 * `px-3 py-2.5` rows — the badges line with the status and date on the right,
 * the title, then the author line.
 */
export function FeedbackListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-hidden className="flex flex-col gap-1 pt-2 pb-4">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex flex-col gap-1 rounded-lg px-3 py-2.5">
          <div className="flex h-5 items-center gap-2">
            <Skeleton className="h-5 w-9 rounded-md" />
            <span className="ml-auto flex items-center gap-1.5">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3 w-8 rounded-md" />
            </span>
          </div>
          <div className="flex h-5 items-center">
            <Skeleton className={cn("h-3.5 rounded-md", ROW_TITLE_WIDTHS[i % ROW_TITLE_WIDTHS.length])} />
          </div>
          <div className="flex h-4 items-center gap-1.5">
            <Skeleton className="size-3.5 rounded-full" />
            <Skeleton className="h-3 w-24 rounded-md" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Label widths of the key/value rows: status, linked issue, type,
    visibility, author, objective, categories, creation date. */
const PROPERTY_LABEL_WIDTHS = ["w-12", "w-24", "w-10", "w-16", "w-14", "w-20", "w-24", "w-20"];
const PROPERTY_VALUE_WIDTHS = ["w-20", "w-6", "w-16", "w-20", "w-28", "w-24", "w-16", "w-24"];

/**
 * The opened post (`FeedbackDetail`): the borderless content header with the
 * Promote, Decline and “…” actions on the right, the scrolling column
 * (`px-4 py-6`, `max-w-3xl`, `gap-6`) with the title, the description and the
 * key/value rows, then the activity, and the comment composer docked below.
 */
export function FeedbackDetailSkeleton() {
  return (
    <div aria-busy="true" className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppContentHeader contentClassName="gap-2">
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <span className="flex size-8 items-center justify-center">
            <Skeleton className="size-4 rounded-md" />
          </span>
        </div>
      </AppContentHeader>
      <div className="min-h-0 flex-1 overflow-hidden px-4 py-6 app-desktop:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {/* Title (text-2xl, leading-tight), then the description. */}
          <div className="flex flex-col gap-2">
            <div className="flex h-[1.875rem] items-center">
              <Skeleton className="h-7 w-2/3 rounded-md" />
            </div>
            <div className="flex min-h-16 flex-col">
              {["w-full", "w-11/12", "w-3/5"].map((width) => (
                <div key={width} className="flex h-[1.375rem] items-center">
                  <Skeleton className={cn("h-3.5 rounded-md", width)} />
                </div>
              ))}
            </div>
          </div>
          {/* What the post IS, on `PropertyRow`s: label left, value right. */}
          <div className="flex flex-col">
            {PROPERTY_LABEL_WIDTHS.map((labelWidth, i) => (
              <div key={i} className="flex min-h-9 items-center justify-between gap-3">
                <Skeleton className={cn("h-3.5 rounded-md", labelWidth)} />
                <Skeleton className={cn("h-6 rounded-md", PROPERTY_VALUE_WIDTHS[i])} />
              </div>
            ))}
          </div>
          {/* Activity: a couple of event lines and a comment. */}
          <div className="flex flex-col gap-3">
            {["w-1/2", "w-2/5"].map((width) => (
              <div key={width} className="flex items-center gap-2">
                <Skeleton className="size-5 shrink-0 rounded-full" />
                <Skeleton className={cn("h-3.5 rounded-md", width)} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="shrink-0 px-4 py-3 app-desktop:px-6">
        <div className="mx-auto max-w-3xl">
          <Skeleton className="h-[5.5rem] w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/**
 * The whole tab, for the route segment: the real `SecondarySidebar` (so the
 * primary bar folds to its rail exactly as when the screen arrives — see
 * `ListDetailSkeleton`), its header actions (filters, new feedback), the
 * column's rows, and the opened post the page selects by default.
 */
export function FeedbackPageSkeleton() {
  return (
    <div className="flex h-full min-h-0">
      <SecondarySidebar
        hiddenOnMobile
        actions={
          <>
            {[0, 1].map((i) => (
              <span key={i} className="flex size-9 items-center justify-center">
                <Skeleton className="size-4 rounded-md" />
              </span>
            ))}
          </>
        }
      >
        <FeedbackListSkeleton />
      </SecondarySidebar>
      <div className="min-h-0 min-w-0 flex-1">
        <FeedbackDetailSkeleton />
      </div>
    </div>
  );
}
