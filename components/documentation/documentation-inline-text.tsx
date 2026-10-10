export const documentationInlineCodeClassName = "break-words rounded bg-muted px-1 text-[.9em]";

/** Figure text supports inline code while preserving all other characters literally. */
export function DocumentationInlineText({ children }: { children: string }) {
  return <>{children.split(/(`[^`\n]+`)/g).map((part, index) => index % 2
    ? <code key={index} className={documentationInlineCodeClassName}>{part.slice(1, -1)}</code>
    : part)}</>;
}
