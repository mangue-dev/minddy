import { Check, Minus } from "lucide-react";
import { cn } from "mangue-ui/lib/utils";
import { CARD_TONES } from "./card-tones";

/**
 * Shared presentation for translated pricing and competitor comparisons.
 * Callers derive their values from billing plans or comparison data.
 */

/** `true` = included, `false` = absent, a string = the cell value. */
export type FeatureCell = string | boolean;

export interface FeatureColumn {
  key: string;
  label: string;
  /** Highlighted column (the recommended plan, minddy in a comparison). */
  highlighted?: boolean;
  /** Match the corresponding plan card in the pastel presentation. */
  tone?: keyof typeof CARD_TONES;
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
  pastel = false,
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
  /** Separate feature groups into rounded panels with colored plan columns. */
  pastel?: boolean;
}) {
  if (pastel) {
    return (
      <div className="space-y-6 sm:space-y-8">
        {groups.map((group) => (
          <div key={group.key} role="region" aria-label={`${caption} — ${group.label}`} tabIndex={0} className="overflow-x-auto rounded-2xl bg-[#f7f7f4] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 dark:bg-[#222321]">
            <table className="w-full min-w-[520px] table-fixed border-separate border-spacing-0 text-sm">
              <caption className="sr-only">{caption} — {group.label}</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 w-[40%] bg-[#f7f7f4] px-4 py-6 text-left text-base font-medium tracking-tight dark:bg-[#222321] sm:px-6">
                    {group.label}
                  </th>
                  {columns.map((column) => (
                    <th key={column.key} scope="col" className={cn("px-3 py-6 text-center text-base font-medium tracking-tight", column.tone && CARD_TONES[column.tone])}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row" className="sticky left-0 z-10 border-t border-black/5 bg-[#f7f7f4] px-4 py-4 text-left font-normal dark:border-white/5 dark:bg-[#222321] sm:px-6">
                      <span className="inline-flex items-center gap-2 text-foreground">
                        {row.label}
                        {row.hint}
                      </span>
                    </th>
                    {row.cells.map((cell, index) => (
                      <td key={columns[index]?.key ?? index} className={cn("relative border-t border-black/5 px-3 py-4 text-center dark:border-white/5", columns[index]?.tone && CARD_TONES[columns[index].tone])}>
                        <FeatureCellValue cell={cell} includedLabel={includedLabel} notIncludedLabel={notIncludedLabel} pastel />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  }

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
                    <FeatureCellValue cell={cell} includedLabel={includedLabel} notIncludedLabel={notIncludedLabel} />
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

function FeatureCellValue({ cell, includedLabel, notIncludedLabel, pastel = false }: {
  cell: FeatureCell;
  includedLabel: string;
  notIncludedLabel: string;
  pastel?: boolean;
}) {
  if (typeof cell === "string") {
    return <span className={pastel ? "font-medium" : "text-foreground/90"}>{cell}</span>;
  }

  return (
    <>
      {cell ? (
        <Check className={cn("size-4", pastel ? "mx-auto" : "text-primary")} strokeWidth={pastel ? 2 : 3} aria-hidden />
      ) : (
        <Minus className={cn("size-4", pastel ? "mx-auto opacity-40" : "text-muted-foreground/50")} aria-hidden />
      )}
      <span className="sr-only">{cell ? includedLabel : notIncludedLabel}</span>
    </>
  );
}
