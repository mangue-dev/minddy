import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { MinddyLogo } from "@/components/minddy-logo";

/**
 * Chrome commun des pages publiques anonymes (vue partagée /share/[token],
 * board de feedback /f/[token]) : header avec un slot gauche et la mention
 * « made with minddy » à droite, puis le contenu. Deux modes de hauteur :
 * fullHeight (h-dvh, le contenu gère son propre overflow — kanban) ou page
 * scrollable naturelle (min-h-dvh — board de feedback).
 */
export async function PublicPageShell({
  heading,
  fullHeight = false,
  children,
}: {
  /** Slot gauche du header (titre, orbe + nom du projet…). */
  heading?: ReactNode;
  fullHeight?: boolean;
  children: ReactNode;
}) {
  const t = await getTranslations("PublicShare");
  return (
    <div className={fullHeight ? "flex h-dvh flex-col" : "flex min-h-dvh flex-col"}>
      <header className="flex shrink-0 items-center justify-between gap-4 px-4 py-3 desktop:px-6">
        {heading ?? <span />}
        <a
          href="/"
          className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <MinddyLogo className="size-3.5" />
          <span>
            {t("madeWith")} <span className="font-semibold">minddy</span>
          </span>
        </a>
      </header>
      {children}
    </div>
  );
}
