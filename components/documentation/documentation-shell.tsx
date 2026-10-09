import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import type { DocumentationArticle } from "@/lib/documentation";
import { documentationPath } from "@/lib/documentation-core.mjs";
import { localizedHref } from "@/lib/locale-href";
import { MinddyLogo } from "@/components/minddy-logo";
import { DocumentationAccountActions } from "./documentation-session";
import { WordmarkLetters } from "@/components/marketing/wordmark-letters";
import wordmarkStyles from "@/components/marketing/nav-wordmark.module.css";
import { DocumentationMobileNavigation, DocumentationSearch, DocumentationSidebar } from "./documentation-navigation";
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
    labels: { topics: t("topics"), welcome: t("welcome"), close: tCommon("close") } };
  const searchArticles = [
    { id: "", locale, title: t("welcome"), topic: t("gettingStarted"), summary: t("welcomeSummary"), tags: [],
      content: [t("welcomeUse"), t("welcomeOperate"), t("welcomeIntegrate")].join("\n\n") },
    ...articles.map(({ id, locale, title, summary, content, tags, topic }) => ({ id, locale, title, summary, content, tags, topic })),
  ];
  return <>
    <a href="#documentation-article" className="sr-only z-50 rounded bg-background p-3 focus:not-sr-only focus:fixed focus:top-2">{t("skip")}</a>
    <header className="fixed inset-x-0 top-0 z-30 flex h-24 items-center border-b border-border bg-background px-3 pb-8 sm:h-16 sm:px-6 sm:pb-0">
      <div className="flex shrink-0 items-center gap-2 lg:-ml-6 lg:h-16 lg:w-72 lg:gap-4 lg:border-r lg:border-border lg:pl-6 lg:pr-3">
        <DocumentationMobileNavigation {...navigation} />
        <div className="flex items-center gap-3">
          <a href={localizedHref("/", locale)} aria-label="minddy" className="rounded focus-visible:outline-2 focus-visible:outline-ring"><MinddyLogo className="h-6" /></a>
          <span aria-hidden className="hidden text-border min-[375px]:inline">|</span>
          <a href={documentationPath(null, locale)} className="hidden rounded text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring min-[375px]:inline">
            <span className={wordmarkStyles.brand}><WordmarkLetters text={t("navTitle")} /></span>
          </a>
        </div>
        <div className="ml-2 lg:ml-auto"><DocumentationSearch articles={searchArticles}
          locale={locale} initialQuery={initialQuery} labels={{ search: t("search"), articles: t("articles"), noResults: t("noResults"), open: t("openArticle") }} /></div>
      </div>
      <nav aria-label={t("breadcrumb")} className="absolute inset-x-6 bottom-0 flex h-8 min-w-0 items-center gap-3 text-xs sm:static sm:mx-6 sm:h-auto sm:flex-1 sm:text-[13px]">
        <span className="max-w-[45%] shrink-0 truncate text-muted-foreground sm:max-w-none">{topic}</span><span aria-hidden className="text-muted-foreground/50">/</span>
        <span aria-current="page" className="truncate">{title}</span>
      </nav>
      <div className="ml-auto shrink-0"><DocumentationAccountActions currentId={currentId} locale={locale} /></div>
    </header>
    <DocumentationContents key={currentId ?? "welcome"} sections={sections} label={t("contents")} />
    <aside className="fixed bottom-0 left-0 top-16 hidden w-72 overflow-y-auto overscroll-contain border-r border-border lg:block">
      <DocumentationSidebar {...navigation} />
    </aside>
    <main data-documentation-main className="min-w-0 pt-36 sm:pt-28 lg:pl-72 xl:pr-64 xl:pt-16">
      <div className="mx-auto max-w-[52rem] px-6 pb-16 pt-10 sm:px-10 sm:pt-12 lg:px-12">
        <article id="documentation-article" tabIndex={-1} className="min-w-0 scroll-mt-40 outline-none sm:scroll-mt-32 xl:scroll-mt-24">
          {children}
        </article>
      </div>
    </main>
  </>;
}
