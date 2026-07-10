import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "mangue-ui";
import { MinddyLogo } from "@/components/minddy-logo";
import type { PublicSiteTab } from "@/lib/feedback/types";

/**
 * Chrome commun des pages publiques anonymes (vue partagée /share/[token],
 * board de feedback /f/[token]) : header avec un slot gauche, des onglets de
 * navigation optionnels (Feedback + vues partagées — le « site public » du
 * projet), un slot d'actions à droite et la mention « made with minddy ».
 * Deux modes de hauteur : fullHeight (h-dvh, le contenu gère son overflow —
 * kanban) ou page scrollable naturelle (min-h-dvh — board de feedback).
 */
export async function PublicPageShell({
  heading,
  tabs = [],
  actions,
  fullHeight = false,
  contained = false,
  children,
}: {
  /** Slot gauche du header (titre, orbe + nom du projet…). */
  heading?: ReactNode;
  /** Onglets sous le header (board + vues partagées). */
  tabs?: PublicSiteTab[];
  /** Slot droit du header (identité, connexion…). */
  actions?: ReactNode;
  fullHeight?: boolean;
  /** Contraint header et onglets à la même largeur max que le contenu. */
  contained?: boolean;
  children: ReactNode;
}) {
  const t = await getTranslations("PublicShare");
  const containerClass = contained ? "mx-auto w-full max-w-5xl" : "w-full";

  return (
    <div className={fullHeight ? "flex h-dvh flex-col" : "flex min-h-dvh flex-col"}>
      <header className="shrink-0 border-b border-border/60">
        <div
          className={cn(
            containerClass,
            "flex items-center justify-between gap-3 px-4 py-3 desktop:px-6"
          )}
        >
          {/* min-w-0 pour que le titre tronque au lieu de pousser les actions
              (sur mobile, tout se chevauchait). */}
          <div className="min-w-0 flex-1">{heading ?? <span />}</div>
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            {actions}
            <a
              href="/"
              className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <MinddyLogo className="size-3.5" />
              {/* Sur mobile, le logo suffit — le libellé prendrait la place du titre. */}
              <span className="hidden sm:inline">
                {t("madeWith")} <span className="font-semibold">minddy</span>
              </span>
            </a>
          </div>
        </div>
        {tabs.length > 0 && (
          <nav
            className={cn(
              containerClass,
              "-mb-px flex gap-5 overflow-x-auto px-4 desktop:px-6"
            )}
          >
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "whitespace-nowrap border-b-2 pb-2 pt-1 text-sm font-medium transition-colors",
                  tab.active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      {children}
    </div>
  );
}
