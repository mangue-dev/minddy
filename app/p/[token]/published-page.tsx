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
 * A PUBLISHED PAGE (MIN-283), rendered for someone who does not have an account.
 *
 * Two routes rely on this file: `/p/[token]` (the page that the link
 * designates) and `/p/[token]/[pageId]` (a page of its branch, when the
 * publication includes subpages). A single rendering for both — the
 * The difference lies in an identifier, not in a screen.
 *
 * **Nothing to add to `lib/public-routes.ts`, and this is deliberate**: one page
 * published is not a public page of the SITE. It does not have content held by
 * us, no `lastModified` in hand, no space for the sitemap, and it carries
 * `noindex` unless expressly requested. The question therefore does not arise.
 */

/** Deduplicated between `generateMetadata` and rendering. */
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
  // Locked, the page says neither its title nor the name of the project — only
  // that it is locked, which the visitor already sees.
  if (!(await isShareUnlocked(bundle.share))) {
    const tShare = await getTranslations("PublicShare");
    return publicTokenMetadata({
      title: t("protectedTitle"),
      description: tShare("metaProtectedDescription"),
      locale: locale as Locale,
    });
  }

  const title = bundle.page.title || t("untitled");
  // `publicTokenMetadata` sets `noindex`, and nothing removes it: publishing is not
  // not reference, and it is not even an option (see the migration
  // `page_shares_no_indexing`). An index removal is not undone with a click.
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
      // The project logo and name, as on the feedback board: one page
      // published is circulating far from minddy, and it is the only thing that says where
      // it came from.
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
      {/* The column of the document, at the same width as in the application: this
 that we publish must read like what we wrote. */}
      <main className="mx-auto w-full max-w-3xl px-6 py-10 print:px-0 print:py-0">
        {/* The breadcrumb NEVER goes back above the published page: it
 says nothing about the wiki it comes from (cf. page-publication.ts). */}
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
