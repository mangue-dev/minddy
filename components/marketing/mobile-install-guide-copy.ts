import type { MessageKey } from "@/lib/i18n-keys";
import type { MobileInstallGuideCopy } from "./mobile-pwa-install-guide";

/** Shared illustrated guide copy for the download hub and standalone page. */
export function mobileInstallGuideCopy(t: (key: MessageKey<"Download">) => string): MobileInstallGuideCopy {
  return {
    iosEyebrow: t("iosGuideEyebrow"),
    iosTitle: t("iosGuideTitle"),
    iosBody: t("iosGuideBody"),
    iosStepShareTitle: t("iosStepShareTitle"),
    iosStepShareBody: t("iosStepShareBody"),
    iosStepHomeTitle: t("iosStepHomeTitle"),
    iosStepHomeBody: t("iosStepHomeBody"),
    iosStepAddTitle: t("iosStepAddTitle"),
    iosStepAddBody: t("iosStepAddBody"),
    androidEyebrow: t("androidGuideEyebrow"),
    androidTitle: t("androidGuideTitle"),
    androidBody: t("androidGuideBody"),
    androidStepPromptTitle: t("androidStepPromptTitle"),
    androidStepPromptBody: t("androidStepPromptBody"),
    androidStepMenuTitle: t("androidStepMenuTitle"),
    androidStepMenuBody: t("androidStepMenuBody"),
    uiShare: t("installUiShare"),
    uiAddToHome: t("installUiAddToHome"),
    uiOpenAsWebApp: t("installUiOpenAsWebApp"),
    uiAdd: t("installUiAdd"),
    uiCancel: t("installUiCancel"),
    uiInstallApp: t("installUiInstallApp"),
    uiInstall: t("installUiInstall"),
    uiNotNow: t("installUiNotNow"),
    uiCopy: t("installUiCopy"),
    uiSettings: t("installUiSettings"),
  } satisfies MobileInstallGuideCopy;
}

/** The standalone Android path starts with the menu, without requiring an install event. */
export function standaloneMobileInstallGuideCopy(
  download: (key: MessageKey<"Download">) => string,
  mobile: (key: MessageKey<"DownloadMobile">) => string,
): MobileInstallGuideCopy {
  return {
    ...mobileInstallGuideCopy(download),
    iosTitle: download("iosGuideEyebrow"),
    androidTitle: download("androidGuideEyebrow"),
    androidBody: mobile("androidBody"),
    androidStepMenuTitle: mobile("androidMenuTitle"),
    androidStepMenuBody: mobile("androidMenuBody"),
    androidStepPromptTitle: mobile("androidConfirmTitle"),
    androidStepPromptBody: mobile("androidConfirmBody"),
  };
}
