import { cn } from "@/lib/utils";

// The editor's body typography, apart from the editor itself so a surface
// that only shows a page's text, such as a landing figure, matches it exactly
// without loading tiptap.

/** The typography of a surface. `page` is the document-sized body of pages and
 the notebook; `compact` the panel-sized one of descriptions and comments. */
export type RichEditorSize = "page" | "compact";

/* Body typography. The edition IS the preview: there is no raw Markdown mode.
 The compact scale mirrors `<Markdown>`, so a committed description reads like
 the surface that wrote it. */
const PROSE_BASE = cn(
  "leading-relaxed break-words outline-none",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:my-2",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0",
  "[&_li]:my-0.5",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[1em]",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_strong]:font-semibold"
  // The leaflet is NOT here: its node view does not render `<details>` but
  // three `div[data-type]`, which these selectors never touched. Its
  // layout lives in app/globals.css, along with the rest of what needs to be aimed at
  // attributes rather than tags.
);

/**
 * The headings of EVERY editor surface: the page's are the reference — a
 * clear step between levels, close to Notion's 30 / 24 / 20 px — and a
 * description or a comment shows a title the size a page shows it.
 */
const PROSE_HEADINGS = cn(
  "[&_h1]:mt-7 [&_h1]:mb-2 [&_h1]:text-[1.875rem] [&_h1]:leading-tight [&_h1]:font-semibold [&_h1]:tracking-tight",
  "[&_h2]:mt-6 [&_h2]:mb-1.5 [&_h2]:text-2xl [&_h2]:leading-snug [&_h2]:font-semibold [&_h2]:tracking-tight",
  "[&_h3]:mt-5 [&_h3]:mb-1 [&_h3]:text-xl [&_h3]:leading-snug [&_h3]:font-semibold"
);

export const PROSE: Record<RichEditorSize, string> = {
  page: cn(
    PROSE_BASE,
    "text-base",
    PROSE_HEADINGS,
    "[&_hr]:my-4 [&_hr]:border-border"
  ),
  compact: cn(
    PROSE_BASE,
    "text-sm",
    PROSE_HEADINGS,
    "[&_hr]:my-3 [&_hr]:border-border"
  ),
};
