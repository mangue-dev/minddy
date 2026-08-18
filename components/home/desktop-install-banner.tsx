"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, IconButton } from "mangue-ui";
import { X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useAuth } from "@/lib/auth-context";
import { useAnalytics } from "@/lib/use-analytics";
import { isDesktop } from "@/lib/desktop/bridge";
import {
  DESKTOP_PROMPT_DISMISSED_META_KEY,
  isMacPlatform,
  resolveDesktopPromptDismissed,
  shouldOfferDesktopApp,
} from "@/lib/desktop/install-prompt";

/**
 * “minddy exists as a Mac app” — on the WEB home page, only once in a lifetime
 * of the account (MIN-292).
 *
 * **To reject is to dismiss forever.** The refusal is written in the
 * `user_metadata` of the account and not in the browser: otherwise it would return to
 * first cache clean and on the second machine, and “no thanks”
 * would become “ask me again tomorrow”. The complete rule — and the trap of
 * the iPad that masquerades as a Mac — lives in
 * [lib/desktop/install-prompt.ts](../../lib/desktop/install-prompt.ts).
 *
 * **Everything is read AFTER editing.** Neither `navigator` nor `window.minddy`
 * do not exist in server rendering; assuming them would cause the hydration to diverge. There
 * banner therefore never appears at the first paint, which is good: a
 * proposition that arises under someone's fingers is a proposition that we
 * clique par accident.
 */
export function DesktopInstallBanner() {
  const t = useTranslations("Home");
  const { user, updateUserMetadata } = useAuth();
  const { track } = useAnalytics();
  const [eligible, setEligible] = useState(false);
  // Discarded immediately, without waiting for GoTrue: the gesture must be instantaneous.
  const [dismissed, setDismissed] = useState(false);
  // The effect returns when GoTrue finally gives the account: without this lock, the
  // same banner would have two “views” for a single display, and the rate of
  // The conversion that we draw from it would be wrong by half.
  const shownTracked = useRef(false);

  const alreadyDismissed = resolveDesktopPromptDismissed(user?.user_metadata);

  useEffect(() => {
    const offer = shouldOfferDesktopApp({
      inDesktopApp: isDesktop(),
      isMac: isMacPlatform({
        uaDataPlatform: (
          navigator as Navigator & { userAgentData?: { platform?: string } }
        ).userAgentData?.platform,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
      }),
      dismissed: alreadyDismissed,
    });
    setEligible(offer);
    if (offer && !shownTracked.current) {
      shownTracked.current = true;
      track("desktop_install_prompt_shown");
    }
  }, [alreadyDismissed, track]);

  if (!eligible || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    track("desktop_install_prompt_dismissed");
    // In case of failure, we do not put the banner back: the user said no, and
    // giving it back to him because GoTrue hiccupped would be asking him again. She
    // will return on the next load, which is the worst acceptable.
    void updateUserMetadata({ [DESKTOP_PROMPT_DISMISSED_META_KEY]: true }).catch(
      () => {}
    );
  };

  return (
    // Same shell as the other welcome banners
    // (`pending-invitations-banner.tsx`): the column that carries them already holds
    // the differences, therefore no own margin.
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      {/* The real icon of the app — the one used to make the `.icns`. */}
      <Image
        src="/web-app-manifest-192x192.png"
        alt=""
        width={32}
        height={32}
        className="size-8 shrink-0 rounded-lg"
      />
      <p className="min-w-0 flex-1 text-sm">{t("desktopBannerText")}</p>
      <div className="flex items-center gap-1">
        <Button asChild size="sm" variant="ghost">
          <Link
            href="/download"
            onClick={() => track("desktop_install_prompt_clicked", { surface: "home_banner" })}
          >
            {t("desktopBannerCta")}
          </Link>
        </Button>
        {/* A REAL tooltip, not the `title` attribute: this one does not appear
 after a second of immobility, does not trigger on the keyboard, and
 is drawn in the style of the system rather than that of the app.
 The `aria-label` remains — it is what a reader reads screen, and
 the tooltip does not replace it. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={t("desktopBannerDismiss")}
              onClick={dismiss}
            >
              <X />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>{t("desktopBannerDismiss")}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
