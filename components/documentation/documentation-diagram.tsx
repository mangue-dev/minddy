import { cn } from "mangue-ui";
import { CARD_TONES } from "@/components/marketing/card-tones";
import type { DocumentationDiagram as Diagram, DocumentationFigure } from "@/lib/documentation";

const tones = [CARD_TONES.sky, CARD_TONES.mint, CARD_TONES.lavender, CARD_TONES.peach];

function DiagramItems({ items, sequence }: { items: NonNullable<Diagram["items"]>; sequence: boolean }) {
  return <span className={cn("grid gap-3", !sequence && "sm:grid-cols-2")}>
    {items.map((item, index) => <span key={index} className="block min-w-0">
      <span className={cn("flex items-start gap-3 rounded-xl border border-current/10 p-4 sm:p-5", tones[index % tones.length])}>
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full border border-current/15 text-xs font-medium">{sequence ? index + 1 : "·"}</span>
        <span className="block min-w-0 self-center">
          <span className="block text-sm font-medium leading-6">{item.title}</span>
          {item.detail && <span className="mt-1 block text-sm leading-6 opacity-80">{item.detail}</span>}
        </span>
      </span>
      {sequence && index < items.length - 1 && <span aria-hidden className="mt-3 block text-center text-sm leading-4 text-muted-foreground">↓</span>}
    </span>)}
  </span>;
}

/** Text stays selectable and reflows with the article instead of shrinking inside a bitmap. */
export function DocumentationDiagram({ figure }: { figure: DocumentationFigure & { diagram: Diagram } }) {
  const diagram = figure.diagram;
  return <span className="my-5 block">
    <span role="group" aria-label={figure.alt} className="block rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-6">
      {diagram.title && <span className="mb-4 block text-sm font-semibold leading-6">{diagram.title}</span>}
      {diagram.items && <DiagramItems items={diagram.items} sequence={diagram.layout === "sequence"} />}
      {diagram.columns && <span className="grid gap-5 sm:grid-cols-2">
        {diagram.columns.map((column, index) => <span key={index} className="block min-w-0">
          <span className="mb-3 block text-sm font-medium">{column.title}</span>
          <DiagramItems items={column.items.map(title => ({ title }))} sequence />
        </span>)}
      </span>}
      {diagram.rows && <span className="grid gap-3">
        {diagram.rows.map((row, index) => <span key={index} className={cn("grid gap-3 rounded-xl border border-current/10 p-4 sm:grid-cols-3 sm:p-5", tones[index % tones.length])}>
          {row.map((cell, column) => <span key={column} className="block min-w-0 text-sm leading-6">
            <span className="mb-1 block text-xs opacity-70">{diagram.headers?.[column]}</span>
            <span className={cn("block", column === 0 && "font-medium")}>{cell}</span>
          </span>)}
        </span>)}
      </span>}
      {diagram.note && <span className="mt-4 block text-sm leading-6 text-muted-foreground">{diagram.note}</span>}
    </span>
    <span className="mt-2 block text-sm leading-6 text-muted-foreground">{figure.caption}</span>
  </span>;
}
