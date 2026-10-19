/**
 * The tiptap node VIEWS class join: a dependency-free `filter(Boolean).join`.
 *
 * The page block register must stay importable outside the browser (markdown
 * projection, MCP tools, tests), so its views keep this helper rather than
 * `cn`. `cn` merges competing Tailwind classes; these views don't need it, they
 * just attach conditions. Everywhere else in the repository — including the
 * page editor — we take `cn`.
 */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
