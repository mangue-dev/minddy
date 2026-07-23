import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "mangue-ui";
import { MinddyLogo } from "@/components/minddy-logo";
import { getAppEnv, ENV_LOGO_TINT } from "@/lib/env";

/**
 * Pages légales (mentions, CGU, confidentialité, cookies) — accessibles sans
 * compte, d'où leur présence dans PUBLIC_ROUTES du proxy. Mise en page sobre :
 * en-tête logo, colonne de texte, navigation croisée en pied. La landing les
 * référencera quand elle existera.
 */

const PAGES = [
  { href: "/legal", key: "legal" },
  { href: "/terms", key: "terms" },
  { href: "/privacy", key: "privacy" },
  { href: "/cookies", key: "cookies" },
] as const;

export default async function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("LegalNav");

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="mx-auto w-full max-w-3xl px-6 pt-10">
        <Link
          href="/"
          aria-label="minddy"
          className="inline-flex w-fit items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MinddyLogo
            className={cn("h-7 w-auto text-foreground", ENV_LOGO_TINT[getAppEnv()])}
          />
          <span className="font-display text-lg font-semibold tracking-tight">
            minddy
          </span>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-8 px-6 py-10">{children}</main>

      <footer className="mx-auto w-full max-w-3xl px-6 pb-12">
        <nav className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-6 text-sm text-muted-foreground">
          {PAGES.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="transition-colors hover:text-foreground"
            >
              {t(page.key)}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
