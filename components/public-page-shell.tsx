import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "mangue-ui";
import { MinddyLogo } from "@/components/minddy-logo";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import type { PublicSiteTab } from "@/lib/feedback/types";

/**
 * Common chrome for anonymous public pages (shared view /share/[token],
 * feedback board /f/[token]): header with a slot on the left, tabs of
 * optional navigation (Feedback + shared views — the “public site” of the
 * project), an actions slot on the right and the mention “made with minddy”.
 * Two height modes: fullHeight (h-dvh, the content manages its overflow —
 * kanban) or natural scrollable page (min-h-dvh — feedback board).
 *
 * LEGAL FOOOTER (GDPR art. 13). It is a link, and it is here rather
 * than in the board because the need is the same on both surfaces: this
 * are pages where minddy processes the data of people who do not have an account
 * with him. The mention at the collection point of the board only lives in the
 * email verification dialog — a visitor arriving by SSO never sees it
 * (his identity is set by the editor's backend), and a simple
 * reader neither, even though he receives the cookies banner. Absolute URL: on a
 * custom domain, `/privacy` leads nowhere.
 */
export async function PublicPageShell({
  heading,
  tabs = [],
  actions,
  fullHeight = false,
  contained = false,
  children,
}: {
  /** Left slot of the header (title, orb + project name, etc.). */
  heading?: ReactNode;
  /** Tabs under the header (board + shared views). */
  tabs?: PublicSiteTab[];
  /** Right slot of the header (identity, connection, etc.). */
  actions?: ReactNode;
  fullHeight?: boolean;
  /** Constrain header and tabs to the same max width as the content. */
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
          {/* min-w-0 to make the title truncate instead of pushing actions
 (on mobile everything overlapped). */}
          <div className="min-w-0 flex-1">{heading ?? <span />}</div>
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            {actions}
            {/* Absolute link: on a custom domain (MIN-36), "/" would be
 the root of the client's site, not minddy. */}
            <a
              href={SITE_URL}
              className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <MinddyLogo className="h-3.5 w-auto" />
              {/* On mobile, the logo is enough — the wording would take the place of the title. */}
              <span className="hidden sm:inline">
                {t("madeWith")} <span className="font-semibold">{SITE_NAME}</span>
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
      <footer className="shrink-0 border-t border-border/60">
        <div
          className={cn(
            containerClass,
            "flex items-center justify-end px-4 py-3 desktop:px-6"
          )}
        >
          <a
            href={`${SITE_URL}/privacy`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          >
            {t("privacyLink")}
          </a>
        </div>
      </footer>
    </div>
  );
}
