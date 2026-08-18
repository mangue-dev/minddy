"use client";

import { useEffect, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Spinner } from "mangue-ui";
import { FileText } from "lucide-react";
import type { JSONContent } from "@tiptap/core";

import { fetchPageApi } from "@/lib/pages-api";
import { pageKey, usePagesQuery } from "@/lib/use-pages-query";
import { descendantIds } from "@/lib/pages";
import { PageEditor } from "@/components/pages/page-editor";
import type { PagesLookup } from "@/components/pages/pages-lookup";

/**
 * The PDF of a page, and it's the PRINT of the browser that makes it
 * (MIN-283).
 *
 * No PDF engine on the server side, and it's not a laziness saving: a
 * rendering engine in a function, it's several hundred of megabytes of
 * package, a cold start, and above all a SECOND definition of the setting in
 * page to be kept in accordance with the first. The browser already has the
 * document, fonts and pagination; all it was missing was a sheet
 * `@media print`, which lives in app/globals.css.
 *
 * The Surface is the same read-only editor as everywhere else — the preview
 * of a version, the published page. One page per sheet, a page break between
 * each: this is what distinguishes “printing a branch” from “pasting three
 * documents in a row”.
 */
export function PagePrintView({
  projectId,
  pageId,
  branch,
}: {
  projectId: string;
  pageId: string;
  /** The page AND its subpages, in tree order. */
  branch: boolean;
}) {
  const t = useTranslations("Pages");
  const { pages, byId, loading } = usePagesQuery(projectId);

  const ids = useMemo(() => {
    if (!branch) return [pageId];
    // The order of the TREE, not that of the query: we print a document,
    // so subpages follow their parent.
    return [pageId, ...descendantIds(pages, pageId)];
  }, [branch, pageId, pages]);

  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: pageKey(id),
      queryFn: () => fetchPageApi(projectId, id),
    })),
  });
  const ready = !loading && results.every((r) => r.data || r.isError);

  const lookup = useMemo<PagesLookup>(
    () => ({
      ready: !loading,
      get: (id) => {
        const row = byId.get(id);
        return row ? { id: row.id, title: row.title, icon: row.icon } : undefined;
      },
      // Neither link nor navigation: on paper, an anchor leads nowhere, and
      // in a PDF it would lead to a screen to which the reader does not have access.
    }),
    [byId, loading]
  );

  /* ── Printing, and the mark that cuts the page ────────────────────── */
  //
  // `data-print-mode` on `<html>`: the print sheet uses it to
  // hide everything that is not this document (app/globals.css). Without her, the
  // rest of the application's chrome would go to the printer with.
  useEffect(() => {
    document.documentElement.dataset.printMode = "1";
    return () => {
      delete document.documentElement.dataset.printMode;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    // After painting: `print()` freezes the rendering as is, and a document whose
    // blocks are not mounted would print half empty.
    const handle = requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
    return () => cancelAnimationFrame(handle);
  }, [ready]);

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div data-print-root className="mx-auto w-full max-w-3xl px-8 py-10">
      {results.map((result, index) => {
        const page = result.data;
        if (!page) return null;
        return (
          <article
            key={page.id}
            // One page per sheet: the next one starts on a new one.
            className={index > 0 ? "break-before-page pt-10 print:pt-0" : undefined}
          >
            <h1 className="flex items-start gap-3 text-3xl leading-tight font-bold tracking-tight">
              {page.icon ? (
                <span aria-hidden className="shrink-0">
                  {page.icon}
                </span>
              ) : (
                <FileText aria-hidden className="mt-1.5 size-6 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0">{page.title || t("untitled")}</span>
            </h1>
            <div className="mt-5">
              <PageEditor
                initialContent={(page.content as JSONContent | null) ?? null}
                onChange={() => {}}
                editable={false}
                pages={lookup}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}
