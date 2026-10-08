import { getMessages } from "next-intl/server";
import { InheritedIntlProvider } from "@/components/browser-intl-provider";

/** Documentation has its own navigation and a scoped client catalog. */
export default async function DocumentationLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();
  return <InheritedIntlProvider messages={{ Common: messages.Common, Language: messages.Language }}>
    <div className="min-h-dvh bg-background text-foreground">{children}</div>
  </InheritedIntlProvider>;
}
