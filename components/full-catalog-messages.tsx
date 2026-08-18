import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

/**
 * Serves the FULL i18n catalog to the client subtree of a segment (MIN-100).
 *
 * The root layout only sends the four site namespaces to the browser
 * public (`lib/public-client-messages.ts`), and it **always** sends them — see
 * `app/layout.tsx` for the reason. Any segment whose customer components
 * translate elsewhere than in these four so mount this provider: the app
 * authenticated, login screen, public feedback boards and views
 * shared.
 *
 * `NextIntlClientProvider` REPLACES inherited messages, it does not complete them
 * not: this provider must contain everything that its subtree translates. THE
 * entire catalog is therefore the safe bet — that’s already what these pages
 * received before.
 */
export async function FullCatalogMessages({ children }: { children: ReactNode }) {
  return <NextIntlClientProvider messages={await getMessages()}>{children}</NextIntlClientProvider>;
}
