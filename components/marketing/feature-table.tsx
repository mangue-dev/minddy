import { Check, Minus } from "lucide-react";
import { cn } from "mangue-ui/lib/utils";

/**
 * The comparative table of the public site, without its content (MIN-93).
 *
 * Extract from `pricing-comparison.tsx`, which was the only caller: the
 * pages `/alternatives/<outil>` compare the same thing in another form —
 * grouped rows, columns, and cells that have a yes, no, or a
 * value. A second copied table would have diverged on the first correction
 * of the layout, and the sticky left column is precisely the kind of
 * detail that is not copied correctly.
 *
 * Purely presentational: NO translation here, no access to the plans. The
 * labels arrive already translated, the cells already calculated. This is what
 * allows the pricing page to continue to derive its values ​​from
 * `BILLING_PLANS` while the comparisons derive theirs from
 * `lib/comparisons.ts`.
 */

/** `true` = included, `false` = absent, a string = the cell value. */
export type FeatureCell = string | boolean;

export interface FeatureColumn {
  key: string;
  label: string;
  /** Highlighted column (the recommended plan, minddy in a comparison). */
  highlighted?: boolean;
}

export interface FeatureRow {
  key: string;
  label: string;
  /** Detail folded behind an “i”, when the line requires one. */
  hint?: React.ReactNode;
  /** One cell per column, in the same order. */
  cells: ReadonlyArray<FeatureCell>;
}

export interface FeatureGroup {
  key: string;
  label: string;
  rows: ReadonlyArray<FeatureRow>;
}

export function FeatureTable({
  caption,
  columns,
  groups,
  includedLabel,
  notIncludedLabel,
}: {
  /** Title read by screen readers (`<caption class="sr-only">`). */
  caption: string;
  columns: ReadonlyArray<FeatureColumn>;
  groups: ReadonlyArray<FeatureGroup>;
  /** Icon labels yes/no, for those who cannot see the icons. */
  includedLabel: string;
  notIncludedLabel: string;
}) {
  return (
    <div className="overflow-x-auto">
      {/* `border-separate` and not `border-collapse`: the left column is
 pasted to the left to survive the horizontal scrolling of the mobile, and
 a cell `sticky` under `border-collapse` loses the rule of its line
 (the line then belongs to the table, not to the cell). Each
 cell therefore carries its own `border-t`. */}
      <table className="w-full min-w-[520px] border-separate border-spacing-0 text-sm">
        <caption className="sr-only">{caption}</caption>

        {groups.map((group, groupIndex) => (
          <tbody key={group.key}>
            {/* Thirty lines later, “the middle column, was Go?” »
 is the only question that matters. A `sticky` y
 header would respond, but the navbar retracts on scrolling: it
 would float above an empty stripe. Each group recalls
 therefore the columns itself — and it also works on the table
 which scrolls sideways, where nothing can stick. */}
            <tr>
              <th
                scope="col"
                className={cn(
                  "sticky left-0 z-10 w-[38%] bg-background pr-6 pb-3 text-left text-sm font-semibold text-foreground",
                  groupIndex > 0 && "pt-12",
                )}
              >
                {group.label}
              </th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "pb-3 text-center text-sm font-semibold",
                    groupIndex > 0 && "pt-12",
                    column.highlighted ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>

            {group.rows.map((row) => (
              <tr key={row.key}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-t border-border bg-background py-3.5 pr-6 text-left font-normal"
                >
                  <span className="inline-flex items-center gap-1.5 text-foreground">
                    {row.label}
                    {row.hint}
                  </span>
                </th>
                {row.cells.map((cell, index) => (
                  // `relative`: sr-only labels are in absolute position.
                  // Sans bloc conteneur local, ils se positionnent par rapport
                  // to the document and escape horizontal scrolling of the
                  // table — the entire page would overflow on mobile.
                  <td
                    key={columns[index]?.key ?? index}
                    className="relative border-t border-border py-3.5 text-center"
                  >
                    {typeof cell === "boolean" ? (
                      cell ? (
                        <>
                          <Check
                            className="mx-auto h-4 w-4 text-primary"
                            strokeWidth={3}
                            aria-hidden
                          />
                          <span className="sr-only">{includedLabel}</span>
                        </>
                      ) : (
                        <>
                          <Minus
                            className="mx-auto h-4 w-4 text-muted-foreground/50"
                            aria-hidden
                          />
                          <span className="sr-only">{notIncludedLabel}</span>
                        </>
                      )
                    ) : (
                      <span className="text-foreground/90">{cell}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
