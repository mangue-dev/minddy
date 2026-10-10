import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { InheritedIntlProvider } from "@/components/browser-intl-provider";
import { DocumentationHeader } from "@/components/documentation/documentation-header";
import { DocumentationSession } from "@/components/documentation/documentation-session";
import { getPublishedDocumentation } from "@/lib/server/documentation";
import { publicClientMessages } from "@/lib/public-client-messages";

/** Keep the installer and overview in the same public documentation help session. */
export default async function SelfHostingLayout({ children }: { children: React.ReactNode }) {
  const locale = (await getLocale()) as Locale;
  const [messages, t] = await Promise.all([getMessages(), getTranslations("Documentation")]);
  const articles = getPublishedDocumentation(locale);
  return <InheritedIntlProvider messages={{ ...publicClientMessages(messages), Common: messages.Common, Documentation: messages.Documentation,
    Auth: messages.Auth, ApiErrors: messages.ApiErrors, Assistant: messages.Assistant }}>
    <DocumentationSession locale={locale} selfHosting>
      <DocumentationHeader articles={articles} locale={locale} currentId="installation" title={t("installWizardTitle")} topic={t("operate")} sections={[]} />
      <main data-documentation-main className="min-w-0 pt-24 sm:pt-16">{children}</main>
    </DocumentationSession>
  </InheritedIntlProvider>;
}
