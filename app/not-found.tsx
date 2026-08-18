import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "mangue-ui";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { appPageMetadata } from "@/lib/app-metadata";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";

/**
 * Vraie page 404 (MIN-88).
 *
 * minddy had none, and didn't need one: the proxy protected
 * “anything but a whitelist”, so `/blog`, `/docs` or a typo
 * went back to `307 → /login?redirect=…`. A redirect is not a
 * absence: it tells the crawler “this page exists, elsewhere”, and the space
 * non-existent URLs being infinite, the “Page with redirection” report of
 * Search Console was too. The proxy now protects a blacklist —
 * what is not there arrives here, with a real 404 status.
 *
 * Marketing chrome rather than a bare screen: we have come across this page since
 * the outside, and a nav is what catches up with the visitor.
 *
 * THE SCALE IS THAT OF THE LANDING, not that of a dialog box. There
 * first version was in a `max-w-lg` with a title in `text-3xl`: asked
 * between the nav and the footer, taller than their normal size, it read like
 * a note lost in the middle of a blank screen. The title therefore takes up the measure of
 * hero (`hero.tsx`), and the number becomes a real display element — even
 * recipe as the wordmark of the footer: a fluid size in `clamp`, a
 * `leading-none` and tight tracking, so that it occupies the width required for it
 * looks on a phone like a big screen.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    ...(await appPageMetadata("notFound")),
    robots: { index: false, follow: true },
  };
}

export default async function NotFound() {
  const [t, locale] = await Promise.all([getTranslations("Common"), getLocale()]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <MarketingNav />
      <main className="flex flex-1 items-center justify-center px-6 py-20 sm:py-28">
        <div className="mx-auto w-full max-w-2xl text-center">
          <p className="mb-4 font-display text-[clamp(6rem,20vw,13rem)] leading-none font-semibold tracking-[-0.06em] text-muted-foreground/40 sm:mb-6">
            404
          </p>
          <h1 className="mb-4 text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-5xl">
            {t("notFoundTitle")}
          </h1>
          <p className="mb-10 text-lg leading-relaxed text-pretty text-muted-foreground">
            {t("notFoundBody")}
          </p>
          <Button asChild size="lg">
            <Link href={localizedHref("/", locale as Locale)}>{t("notFoundCta")}</Link>
          </Button>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
