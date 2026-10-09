import { cn } from "mangue-ui";
import { DocumentationTable } from "./documentation-table";
import { CARD_TONES } from "@/components/marketing/card-tones";
import type { DocumentationDiagram as Diagram, DocumentationFigure } from "@/lib/documentation";

const tones = [CARD_TONES.sky, CARD_TONES.mint, CARD_TONES.lavender, CARD_TONES.peach];

function DiagramItems({ items, sequence }: { items: NonNullable<Diagram["items"]>; sequence: boolean }) {
  return <div className={cn("grid gap-3", !sequence && "sm:grid-cols-2")}>
    {items.map((item, index) => <div key={index} className="block min-w-0">
      <div className={cn("flex items-start gap-3 rounded-xl border border-current/10 p-4 sm:p-5", tones[index % tones.length])}>
        {sequence && <div aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full border border-current/15 text-xs font-medium">{index + 1}</div>}
        <div className="block min-w-0 self-center">
          <div className="block text-sm font-medium leading-6">{item.title}</div>
          {item.detail && <div className="mt-1 block text-sm leading-6 opacity-80">{item.detail}</div>}
        </div>
      </div>
      {sequence && index < items.length - 1 && <div aria-hidden className="mt-3 block text-center text-sm leading-4 text-muted-foreground">↓</div>}
    </div>)}
  </div>;
}

/** Text stays selectable and reflows with the article instead of shrinking inside a bitmap. */
export function DocumentationDiagram({ figure }: { figure: DocumentationFigure & { diagram: Diagram } }) {
  const diagram = figure.diagram;
  return <div className="my-5 block">
    <div role="group" aria-label={figure.alt} className="block rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-6">
      {diagram.title && <div className="mb-4 block text-sm font-semibold leading-6">{diagram.title}</div>}
      {diagram.items && <DiagramItems items={diagram.items} sequence={diagram.layout === "sequence"} />}
      {diagram.columns && <div className="grid gap-5 sm:grid-cols-2">
        {diagram.columns.map((column, index) => <div key={index} className="block min-w-0">
          <div className="mb-3 block text-sm font-medium">{column.title}</div>
          <DiagramItems items={column.items.map(title => ({ title }))} sequence />
        </div>)}
      </div>}
      {diagram.rows && <DocumentationTable label={diagram.title ?? figure.alt}>
        <thead><tr>{diagram.headers?.map((header, index) => <th key={index}>{header}</th>)}</tr></thead>
        <tbody>{diagram.rows.map((row, index) => <tr key={index}>
          {row.map((cell, column) => <td key={column}>{cell}</td>)}
        </tr>)}</tbody>
      </DocumentationTable>}
      {diagram.note && <div className="mt-4 block text-sm leading-6 text-muted-foreground">{diagram.note}</div>}
    </div>
    <div className="mt-2 block text-sm leading-6 text-muted-foreground">{figure.caption}</div>
  </div>;
}
