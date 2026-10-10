import { getLocale, getMessages } from "next-intl/server";
import { InheritedIntlProvider } from "@/components/browser-intl-provider";
import { DocumentationSession } from "@/components/documentation/documentation-session";
import type { Locale } from "@/i18n/config";

/** Documentation has its own navigation and a scoped client catalog. */
export default async function DocumentationLayout({ children }: { children: React.ReactNode }) {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  return <InheritedIntlProvider messages={{ Common: messages.Common, Documentation: messages.Documentation,
    Auth: messages.Auth, ApiErrors: messages.ApiErrors, Assistant: messages.Assistant,
    Nav: messages.Nav, Dictate: messages.Dictate }}>
    <DocumentationSession locale={locale as Locale}><div className="min-h-dvh bg-background text-foreground">{children}</div></DocumentationSession>
  </InheritedIntlProvider>;
}
