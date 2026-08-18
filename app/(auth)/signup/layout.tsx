import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { socialMetadata } from "@/lib/seo";

/**
 * `/signup` is public (the hero, the nav and the footer send there) but
 * has no content to index: it is a form. `index: false,
 * follow: true` (MIN-88) — out of search results, but links
 * that she wears remain followed. The `canonical` protects it from its own
 * variants (`?redirect=…`, `?invite=…`), which are all the same page.
 *
 * Until MIN-300 this URL was a 308 redirect to `/login?mode=signup`
 * declared in `next.config.mjs`; it is now a real page, and the
 * redirect has been removed.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [t, ta, locale] = await Promise.all([
    getTranslations("Meta"),
    getTranslations("Auth"),
    getLocale(),
  ]);
  const title = t("signUp");
  const description = ta("signupSubtitle");
  return {
    title,
    description,
    alternates: { canonical: "/signup" },
    robots: { index: false, follow: true },
    // Explicit social block: `/signup` is public and sticks (“register
    // here"), and Next replaces the parent's `openGraph` object instead of
    // complete — without it, the link preview would say “minddy — A minimal
    // issue tracker”, like the landing.
    ...socialMetadata({ title, description, url: "/signup", locale: locale as Locale }),
  };
}

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
