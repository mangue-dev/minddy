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
 * allows the pricing page to continue to derive its values from
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
  framed = false,
}: {
  /** Title read by screen readers (`<caption class="sr-only">`). */
  caption: string;
  columns: ReadonlyArray<FeatureColumn>;
  groups: ReadonlyArray<FeatureGroup>;
  /** Icon labels yes/no, for those who cannot see the icons. */
  includedLabel: string;
  notIncludedLabel: string;
  /** Give short comparison tables visible cell and outer borders. */
  framed?: boolean;
}) {
  return (
    <div className={cn("overflow-x-auto", framed && "rounded-2xl border border-border")}>
      {/* `border-separate` keeps the sticky first column and each row border
          intact while the table scrolls horizontally on mobile. */}
      <table
        className={cn(
          "w-full min-w-[520px] border-separate border-spacing-0 text-sm",
          framed && "min-w-[720px]",
        )}
      >
        <caption className="sr-only">{caption}</caption>

        {groups.map((group, groupIndex) => (
          <tbody key={group.key}>
            {/* Repeating column labels for each group keeps long pricing tables
                understandable without a vertically sticky header. */}
            <tr className={cn(framed && "bg-muted/35")}>
              <th
                scope="col"
                className={cn(
                  "sticky left-0 z-10 w-[38%] bg-background pr-6 pb-3 text-left text-sm font-semibold text-foreground",
                  groupIndex > 0 && !framed && "pt-12",
                  framed && "border-b border-border bg-muted px-4 py-4",
                )}
              >
                {group.label}
              </th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "pb-3 text-left text-sm font-semibold",
                    groupIndex > 0 && !framed && "pt-12",
                    framed && "border-b border-l border-border px-4 py-4",
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
                  className={cn(
                    "sticky left-0 z-10 border-t border-border bg-background py-3.5 pr-6 text-left font-normal",
                    framed && "px-4",
                  )}
                >
                  <span className="inline-flex items-center gap-1.5 text-foreground">
                    {row.label}
                    {row.hint}
                  </span>
                </th>
                {row.cells.map((cell, index) => (
                  // `relative`: sr-only labels are in absolute position.
                  // Without a local positioned cell, screen-reader labels would
                  // anchor to the document and widen the page on mobile.
                  <td
                    key={columns[index]?.key ?? index}
                    className={cn(
                      "relative border-t border-border py-3.5 text-left",
                      framed && "border-l px-4",
                    )}
                  >
                    {typeof cell === "boolean" ? (
                      cell ? (
                        <>
                          <Check
                            className="h-4 w-4 text-primary"
                            strokeWidth={3}
                            aria-hidden
                          />
                          <span className="sr-only">{includedLabel}</span>
                        </>
                      ) : (
                        <>
                          <Minus
                            className="h-4 w-4 text-muted-foreground/50"
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
