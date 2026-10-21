"use client";

import { useTranslations } from "next-intl";
import { PRODUCTION_SITE_ORIGIN, isPreviewEnv } from "@/lib/env";
import { cn } from "@/lib/utils";

/**
 * Tells visitors that preview is a test version and sends them to the real
 * application on www.minddy.app (MIN-766); sign-ups are closed there. Renders
 * nothing outside preview, so production, local and self-hosted instances are
 * unchanged.
 *
 * It lives on the public site and the auth screens, where a visitor may land
 * by mistake. The app itself does not show it: whoever is signed in there
 * holds a test account and already knows where they are.
 */
export function PreviewEnvBanner({ className }: { className?: string }) {
  const t = useTranslations("PreviewEnvironment");
  if (!isPreviewEnv()) return null;

  return (
    <div
      role="note"
      className={cn(
        "flex min-h-9 shrink-0 items-center justify-center border-b border-border-subtle bg-surface-warning px-4 py-1.5 text-center text-xs leading-snug text-foreground sm:text-sm",
        className,
      )}
    >
      <p>
        {t.rich("banner", {
          link: (chunks) => (
            <a
              href={PRODUCTION_SITE_ORIGIN}
              className="font-medium whitespace-nowrap underline underline-offset-4"
            >
              {chunks}
            </a>
          ),
        })}
      </p>
    </div>
  );
}
