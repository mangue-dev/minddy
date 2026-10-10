import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import type { DocumentationArticle } from "@/lib/documentation";
import { DocumentationSidebar } from "./documentation-navigation";
import { DocumentationHeader } from "./documentation-header";
import { DocumentationContents } from "./documentation-contents";

export async function DocumentationShell({ articles, locale, currentId, title, topic, sections, initialQuery, children }: {
  articles: DocumentationArticle[];
  locale: Locale;
  currentId: string | null;
  title: string;
  topic: string;
  sections: DocumentationArticle["sections"];
  initialQuery?: string;
  children: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "Documentation" });
  const tCommon = await getTranslations({ locale, namespace: "Common" });
  const navigation = { articles: articles.map(({ id, title, topic }) => ({ id, title, topic })), locale, currentId,
    labels: { topics: t("topics"), welcome: t("welcome"), close: tCommon("close"), install: t("installWizardTitle") } };
  return <>
    <a href="#documentation-article" className="sr-only z-50 rounded bg-background p-3 focus:not-sr-only focus:fixed focus:top-2">{t("skip")}</a>
    <DocumentationHeader articles={articles} locale={locale} currentId={currentId} title={title} topic={topic} sections={sections} initialQuery={initialQuery} />
    <DocumentationContents key={currentId ?? "welcome"} sections={sections} label={t("contents")} />
    <aside className="fixed bottom-0 left-0 top-16 hidden w-72 overflow-y-auto overscroll-contain border-r border-border lg:block">
      <DocumentationSidebar {...navigation} />
    </aside>
    <main data-documentation-main className="min-w-0 pt-36 sm:pt-28 lg:pl-72 xl:pr-64 xl:pt-16">
      <div className="mx-auto max-w-[52rem] px-6 pb-16 pt-10 sm:px-10 sm:pt-12 lg:px-12">
        <article id="documentation-article" tabIndex={-1} className="documentation-selectable min-w-0 scroll-mt-40 outline-none sm:scroll-mt-32 xl:scroll-mt-24">
          {children}
        </article>
      </div>
    </main>
  </>;
}
