import { PagePrintView } from "@/components/pages/page-print-view";

/**
 * The PRINT view of a page (MIN-283) — what makes the PDF.
 *
 * `?scope=branch` prints the page AND its subpages, one per page of paper.
 *
 * **Why `pages-print/` and not `pages/[pageId]/print`**: the segment
 * `pages/` carries a layout that raises the secondary bar and the project tree
 * (app/(app)/projects/[id]/pages/layout.tsx). A print view has nothing to
 * do in it — it opens in a tab, calls `window.print()` and
 * farm. Taking it out of the segment costs one word in the URL and avoids having to mount everything
 * a piece of furniture to print it immediately.
 *
 * The path remains under `/projects`, which is protected (lib/protected-prefixes.ts):
 * printing a page requires access to it, like reading it.
 */
export default async function PagePrintRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; pageId: string }>;
  searchParams: Promise<{ scope?: string }>;
}) {
  const [{ id, pageId }, { scope }] = await Promise.all([params, searchParams]);
  return <PagePrintView projectId={id} pageId={pageId} branch={scope === "branch"} />;
}
