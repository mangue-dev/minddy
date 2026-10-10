import { Children, cloneElement, isValidElement, type CSSProperties, type ReactNode } from "react";
import { cn } from "mangue-ui/lib/utils";
import { CARD_TONES } from "@/components/marketing/card-tones";
import { FEATURE_TABLE_PANEL, FEATURE_TABLE_SEPARATOR } from "@/components/marketing/feature-table-styles";

const tones = [CARD_TONES.sky, CARD_TONES.mint, CARD_TONES.lavender, CARD_TONES.peach, CARD_TONES.rose];

/** Keep rich Markdown cells while sharing the pricing table's column surfaces. */
function styleRows(children: ReactNode, header: boolean): ReactNode {
  return Children.map(children, row => {
    if (!isValidElement<{ children?: ReactNode }>(row)) return row;
    return cloneElement(row, {}, Children.map(row.props.children, (cell, index) => {
      if (!isValidElement<{ children?: ReactNode; style?: CSSProperties; className?: string; scope?: string }>(cell)) return cell;
      const first = index === 0;
      const className = cn("align-top px-4 text-left leading-6 sm:px-5", header ? "py-5 text-sm font-medium" : "py-4 font-normal",
        !header && FEATURE_TABLE_SEPARATOR,
        first ? "sticky left-0 z-10 min-w-36 bg-[#f7f7f4] dark:bg-[#222321]" : tones[(index - 1) % tones.length]);
      if (first && !header) return <th scope="row" className={className} style={cell.props.style}>{cell.props.children}</th>;
      return cloneElement(cell, { className, ...(header ? { scope: "col" } : {}) });
    }));
  });
}

export function DocumentationTable({ children, label }: { children: ReactNode; label: string }) {
  return <div role="region" aria-label={label} tabIndex={0} className={cn("my-6 max-w-full", FEATURE_TABLE_PANEL)}>
    <table className="w-full min-w-[520px] border-separate border-spacing-0 text-sm [&_p]:my-0">
      <caption className="sr-only">{label}</caption>
      {Children.map(children, section => {
        if (!isValidElement<{ children?: ReactNode }>(section)) return section;
        return cloneElement(section, {}, styleRows(section.props.children, section.type === "thead"));
      })}
    </table>
  </div>;
}
