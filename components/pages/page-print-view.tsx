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
 * Le PDF d'une page, et c'est l'IMPRESSION du navigateur qui le fabrique
 * (MIN-283).
 *
 * Pas de moteur PDF côté serveur, et ce n'est pas une économie de paresse : un
 * moteur de rendu dans une fonction, c'est plusieurs centaines de mégaoctets de
 * paquet, un démarrage à froid, et surtout une SECONDE définition de la mise en
 * page à tenir en accord avec la première. Le navigateur, lui, a déjà le
 * document, les polices et la pagination ; il ne lui manquait qu'une feuille
 * `@media print`, qui vit dans app/globals.css.
 *
 * La surface est le même éditeur en lecture seule que partout ailleurs — l'aperçu
 * d'une version, la page publiée. Une page par feuille, un saut de page entre
 * chacune : c'est ce qui distingue « imprimer une branche » de « coller trois
 * documents à la suite ».
 */
export function PagePrintView({
  projectId,
  pageId,
  branch,
}: {
  projectId: string;
  pageId: string;
  /** La page ET ses sous-pages, dans l'ordre de l'arbre. */
  branch: boolean;
}) {
  const t = useTranslations("Pages");
  const { pages, byId, loading } = usePagesQuery(projectId);

  const ids = useMemo(() => {
    if (!branch) return [pageId];
    // L'ordre de l'ARBRE, pas celui de la requête : on imprime un document,
    // donc les sous-pages suivent leur parent.
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
      // Ni lien ni navigation : sur du papier, une ancre ne mène nulle part, et
      // dans un PDF elle mènerait à un écran auquel le lecteur n'a pas accès.
    }),
    [byId, loading]
  );

  /* ── L'impression, et la marque qui découpe la page ────────────────────── */
  //
  // `data-print-mode` sur `<html>` : la feuille d'impression s'en sert pour
  // masquer tout ce qui n'est pas ce document (app/globals.css). Sans elle, le
  // reste du chrome de l'application partirait à l'imprimante avec.
  useEffect(() => {
    document.documentElement.dataset.printMode = "1";
    return () => {
      delete document.documentElement.dataset.printMode;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    // Après la peinture : `print()` fige le rendu tel quel, et un document dont
    // les blocs ne sont pas montés s'imprimerait à moitié vide.
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
            // Une page par feuille : la suivante commence sur une nouvelle.
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
