import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { socialMetadata } from "@/lib/seo";

/**
 * `/login` is public (you must be able to connect to it) but has no
 * content to index: it is a form. `index: false, follow: true`
 * (MIN-88) — out of search results, but the links it carries
 * remain followed. The `canonical` protects it from its own variants
 * (`?redirect=…`, `?mode=signup`), which are all the same page.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [t, ta, locale] = await Promise.all([
    getTranslations("Meta"),
    getTranslations("Auth"),
    getLocale(),
  ]);
  const title = t("signIn");
  const description = ta("loginSubtitle");
  return {
    title,
    description,
    alternates: { canonical: "/login" },
    robots: { index: false, follow: true },
    // Explicit social block: `/login` is public and sticks (“register
    // here"), and Next replaces the parent's `openGraph` object instead of
    // complete — without it, the link preview said “minddy — A minimal
    // issue tracker”, like the landing.
    ...socialMetadata({ title, description, url: "/login", locale: locale as Locale }),
  };
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
