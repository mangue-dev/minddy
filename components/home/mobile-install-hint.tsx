"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Cancel01Icon, ArrowRight01Icon, SmartPhone01Icon } from "@hugeicons/core-free-icons";
import { Button } from "mangue-ui";
import { AppIcon } from "@/components/icon";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MobileSheetScrollArea } from "@/components/ui/mobile-sheet";
import { MobilePwaGuideSteps } from "@/components/marketing/mobile-pwa-install-guide";
import { standaloneMobileInstallGuideCopy } from "@/components/marketing/mobile-install-guide-copy";
import { usePwaInstall } from "@/components/marketing/use-pwa-install";
import { useAuth } from "@/lib/auth-context";
import { isDesktop } from "@/lib/desktop/bridge";
import { resolveInstallPlatform } from "@/lib/desktop/install-prompt";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import type { MobileInstallGuidePlatform } from "@/lib/mobile-install-guide";
import type { Locale } from "@/i18n/config";

export const PWA_PROMPT_DISMISSED_META_KEY = "pwa_prompt_dismissed";

/** Offer an account-dismissible install guide only in a mobile browser. */
export function MobileInstallHint() {
  const t = useTranslations("Home");
  const td = useTranslations("Download");
  const tm = useTranslations("DownloadMobile");
  const locale = useLocale() as Locale;
  const { user, updateUserMetadata } = useAuth();
  const mobile = useMobileLayout();
  const [platform, setPlatform] = useState<MobileInstallGuidePlatform | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const alreadyDismissed = user?.user_metadata?.[PWA_PROMPT_DISMISSED_META_KEY] === true;
  const { canPrompt, promptInstall } = usePwaInstall(mobile === true && platform === "android" && Boolean(user) && !installed && !dismissed && !alreadyDismissed);
  const copy = standaloneMobileInstallGuideCopy(td, tm);

  useEffect(() => {
    if (isDesktop()) return;
    const probe = navigator as Navigator & { userAgentData?: { platform?: string }; standalone?: boolean };
    const resolved = resolveInstallPlatform({
      uaDataPlatform: probe.userAgentData?.platform,
      platform: probe.platform,
      userAgent: probe.userAgent,
      maxTouchPoints: probe.maxTouchPoints,
    });
    setPlatform(resolved === "ios" || resolved === "android" ? resolved : null);
    const displayMode = window.matchMedia("(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)");
    const updateDisplayMode = () => setInstalled(displayMode.matches || probe.standalone === true);
    const onInstalled = () => { setInstalled(true); setOpen(false); };
    updateDisplayMode();
    displayMode.addEventListener("change", updateDisplayMode);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      displayMode.removeEventListener("change", updateDisplayMode);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!mobile || !platform || !user || installed || dismissed || alreadyDismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    void updateUserMetadata({ [PWA_PROMPT_DISMISSED_META_KEY]: true }).catch(() => {});
  };

  const install = async () => {
    setInstalling(true);
    const outcome = await promptInstall();
    setInstalling(false);
    if (outcome === "accepted") { setInstalled(true); setOpen(false); }
  };

  return <Dialog open={open} onOpenChange={setOpen}>
    <div data-home-pwa-hint className="flex min-w-0 items-center gap-1 text-muted-foreground">
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-2 whitespace-normal px-2 py-2 text-left text-xs text-muted-foreground">
          <AppIcon icon={SmartPhone01Icon} className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{t("pwaInstallHint")}</span>
          <AppIcon icon={ArrowRight01Icon} className="size-3.5 shrink-0" aria-hidden />
        </Button>
      </DialogTrigger>
      <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 text-muted-foreground" aria-label={t("desktopBannerDismiss")} onClick={dismiss}>
        <AppIcon icon={Cancel01Icon} className="size-4" aria-hidden />
      </Button>
    </div>
    <DialogContent data-pwa-install-guide={platform} className="flex max-h-[90dvh] flex-col gap-4 overflow-hidden">
      <DialogHeader className="shrink-0 pr-12 text-left">
        <DialogTitle>{t("pwaInstallTitle")}</DialogTitle>
        <DialogDescription>{platform === "ios" ? copy.iosBody : copy.androidBody}</DialogDescription>
      </DialogHeader>
      <MobileSheetScrollArea className="min-h-0 overflow-y-auto">
        <MobilePwaGuideSteps platform={platform} copy={copy} locale={locale} id="home-pwa-install-guide" manualAndroid compact />
      </MobileSheetScrollArea>
      {platform === "android" && canPrompt && <Button type="button" className="min-h-11 w-full shrink-0" disabled={installing} onClick={() => void install()}>{copy.uiInstallApp}</Button>}
    </DialogContent>
  </Dialog>;
}
