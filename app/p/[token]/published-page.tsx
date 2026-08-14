import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";

import type { Locale } from "@/i18n/config";
import { appPageMetadata } from "@/lib/app-metadata";
import { publicTokenMetadata } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import { getPublicPageBundle } from "@/lib/server/page-publication";
import { isShareUnlocked } from "@/lib/server/share-unlock";
import { PublicPageShell } from "@/components/public-page-shell";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { PublicPageBody } from "@/components/public-page-body";
import { PagePasswordForm } from "./password-form";

/**
 * Une PAGE PUBLIÉE (MIN-283), rendue pour quelqu'un qui n'a pas de compte.
 *
 * Deux routes s'appuient sur ce fichier : `/p/[token]` (la page que le lien
 * désigne) et `/p/[token]/[pageId]` (une page de sa branche, quand la
 * publication inclut les sous-pages). Un seul rendu pour les deux — la
 * différence tient dans un identifiant, pas dans un écran.
 *
 * **Rien à ajouter à `lib/public-routes.ts`, et c'est délibéré** : une page
 * publiée n'est pas une page publique du SITE. Elle n'a pas de contenu tenu par
 * nous, pas de `lastModified` à la main, pas de place au sitemap, et elle porte
 * `noindex` sauf demande expresse. La question ne se repose donc pas.
 */

/** Dédoublonné entre `generateMetadata` et le rendu. */
const bundleOf = cache(getPublicPageBundle);

export async function publishedPageMetadata(
  token: string,
  pageId?: string
): Promise<Metadata> {
  const [bundle, t, locale] = await Promise.all([
    bundleOf(token, pageId),
    getTranslations("PublicPage"),
    getLocale(),
  ]);
  if (!bundle) {
    return {
      ...(await appPageMetadata("notFound")),
      robots: { index: false, follow: false },
    };
  }
  // Verrouillée, la page ne dit ni son titre ni le nom du projet — seulement
  // qu'elle est verrouillée, ce que le visiteur voit déjà.
  if (!(await isShareUnlocked(bundle.share))) {
    const tShare = await getTranslations("PublicShare");
    return publicTokenMetadata({
      title: t("protectedTitle"),
      description: tShare("metaProtectedDescription"),
      locale: locale as Locale,
    });
  }

  const title = bundle.page.title || t("untitled");
  // `publicTokenMetadata` pose `noindex`, et rien ne le lève : publier n'est
  // pas référencer, et ce n'est même pas une option (cf. la migration
  // `page_shares_no_indexing`). Un retrait d'index ne se défait pas d'un clic.
  return publicTokenMetadata({
    title: `${title} · ${bundle.project.name}`,
    description: t("metaDescription", { project: bundle.project.name }),
    canonical: `${SITE_URL}/p/${token}${pageId ? `/${pageId}` : ""}`,
    locale: locale as Locale,
  });
}

export async function PublishedPage({
  token,
  pageId,
}: {
  token: string;
  pageId?: string;
}) {
  const bundle = await bundleOf(token, pageId);
  if (!bundle) notFound();
  const t = await getTranslations("PublicPage");

  if (!(await isShareUnlocked(bundle.share))) {
    return (
      <PublicPageShell>
        <main className="flex flex-1 items-center justify-center p-6">
          <PagePasswordForm token={token} />
        </main>
      </PublicPageShell>
    );
  }

  const title = bundle.page.title || t("untitled");
  const href = (id: string) =>
    id === bundle.root.id ? `/p/${token}` : `/p/${token}/${id}`;

  return (
    <PublicPageShell
      contained
      // Le logo du projet et son nom, comme sur le board de retours : une page
      // publiée circule loin de minddy, et c'est la seule chose qui dise de qui
      // elle vient.
      heading={
        <div className="flex min-w-0 items-center gap-2">
          <ProjectOrb
            seed={projectOrbSeed(bundle.project)}
            iconUrl={bundle.project.icon_url}
            className="size-5 rounded-[6px]"
          />
          <span className="min-w-0 truncate text-sm font-semibold">
            {bundle.project.name}
          </span>
        </div>
      }
    >
      {/* La colonne du document, à la même largeur que dans l'application : ce
          qu'on publie doit se lire comme ce qu'on a écrit. */}
      <main className="mx-auto w-full max-w-3xl px-6 py-10 print:px-0 print:py-0">
        {/* Le fil d'Ariane ne remonte JAMAIS au-dessus de la page publiée : il
            ne dit rien du wiki d'où elle vient (cf. page-publication.ts). */}
        {bundle.trail.length > 0 && (
          <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {bundle.trail.map((node) => (
              <span key={node.id} className="flex items-center gap-1.5">
                <a href={href(node.id)} className="truncate hover:text-foreground">
                  {node.icon ? `${node.icon} ` : ""}
                  {node.title || t("untitled")}
                </a>
                <span aria-hidden>/</span>
              </span>
            ))}
          </nav>
        )}

        <h1 className="flex items-start gap-3 text-4xl leading-tight font-bold tracking-tight">
          {bundle.page.icon ? (
            <span aria-hidden className="shrink-0 leading-tight">
              {bundle.page.icon}
            </span>
          ) : (
            <FileText aria-hidden className="mt-2 size-7 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0">{title}</span>
        </h1>

        <div className="mt-6">
          <PublicPageBody
            content={bundle.content}
            pages={bundle.pages}
            token={token}
            rootId={bundle.root.id}
            missingLabel={t("subpageNotPublished")}
          />
        </div>
      </main>
    </PublicPageShell>
  );
}
