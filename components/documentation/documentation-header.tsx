import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import type { DocumentationArticle } from "@/lib/documentation";
import { documentationPath } from "@/lib/documentation-core.mjs";
import { localizedHref } from "@/lib/locale-href";
import { MinddyLogo } from "@/components/minddy-logo";
import { DocumentationAccountActions } from "./documentation-session";
import { WordmarkLetters } from "@/components/marketing/wordmark-letters";
import wordmarkStyles from "@/components/marketing/nav-wordmark.module.css";
import { DocumentationMobileNavigation, DocumentationSearch } from "./documentation-navigation";

/** Shared public-guide header, including search, account actions and Numo help. */
export async function DocumentationHeader({ articles, locale, currentId, title, topic, sections, initialQuery }: {
  articles: DocumentationArticle[];
  locale: Locale;
  currentId: string | null;
  title: string;
  topic: string;
  sections: DocumentationArticle["sections"];
  initialQuery?: string;
}) {
  const t = await getTranslations({ locale, namespace: "Documentation" });
  const tCommon = await getTranslations({ locale, namespace: "Common" });
  const navigation = { articles: articles.map(({ id, title, topic }) => ({ id, title, topic })), locale, currentId,
    labels: { topics: t("topics"), welcome: t("welcome"), close: tCommon("close"), install: t("installWizardTitle") } };
  const searchArticles = [
    { id: "", locale, title: t("welcome"), topic: t("gettingStarted"), summary: t("welcomeSummary"), tags: [],
      content: [t("welcomeUse"), t("welcomeOperate"), t("welcomeIntegrate")].join("\n\n") },
    ...articles.map(({ id, locale, title, summary, content, tags, topic }) => ({ id, locale, title, summary, content, tags, topic })),
  ];
  return (
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
      <div className="ml-auto shrink-0"><DocumentationAccountActions currentId={currentId} sections={sections} locale={locale} /></div>
    </header>
  );
}
