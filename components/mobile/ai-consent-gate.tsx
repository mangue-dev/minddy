"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth-context";
import { FIRST_RUN_PENDING_ATTRIBUTE } from "@/lib/first-run";
import {
  AI_CONSENT_CHANGE_EVENT,
  AI_CONSENT_META_KEY,
  AI_CONSENT_REQUEST_EVENT,
  installAiConsentFetchGuard,
  readAiConsent,
  writeAiConsent,
  type AiConsent,
} from "@/lib/mobile/ai-consent";
import { supportedLocaleForTag } from "@/i18n/config";
import { useNativeMobile } from "@/lib/native-app";
import { publicPathForLocale, routeByKey } from "@/lib/public-routes";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(AI_CONSENT_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(AI_CONSENT_CHANGE_EVENT, onChange);
}

/** The answer kept on this device; `null` before it was asked, and on the server. */
export function useAiConsent(): AiConsent | null {
  return useSyncExternalStore(subscribe, () => readAiConsent(), () => null);
}

/**
 * Keeps an answer on this device, for the requests of the app, and on the
 * account, for the cron jobs that run AI on its behalf. The device keeps the
 * answer even when the account write fails; the next answer retries it.
 */
export function useAnswerAiConsent(): (value: AiConsent) => void {
  const { updateUserMetadata } = useAuth();
  return (value) => {
    writeAiConsent(value);
    void updateUserMetadata({ [AI_CONSENT_META_KEY]: value }).catch(() => {});
  };
}

/**
 * Asks, in the mobile app, before any AI feature sends content to a model
 * provider (MIN-907, App Store guideline 5.1.2(i); `lib/mobile/ai-consent.ts`).
 *
 * The sheet opens once signed in, after the first-run screens, while this
 * device has no answer. It opens again when the server refuses AI work for
 * want of consent, so the person can allow it from where they tried. Closing
 * it without choosing keeps the question for the next launch. Renders nothing
 * outside the app.
 */
export function AiConsentGate() {
  const t = useTranslations("AiConsent");
  const locale = useLocale();
  const { user } = useAuth();
  const native = useNativeMobile();
  const [open, setOpen] = useState(false);
  const answerConsent = useAnswerAiConsent();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!native || !userId || readAiConsent() !== null) return;
    const root = document.documentElement;
    const askOnceReady = () => {
      if (root.hasAttribute(FIRST_RUN_PENDING_ATTRIBUTE)) return false;
      setOpen(true);
      return true;
    };
    if (askOnceReady()) return;
    const observer = new MutationObserver(() => {
      if (askOnceReady()) observer.disconnect();
    });
    observer.observe(root, { attributes: true, attributeFilter: [FIRST_RUN_PENDING_ATTRIBUTE] });
    return () => observer.disconnect();
  }, [native, userId]);

  useEffect(() => {
    if (!native) return;
    const ask = () => setOpen(true);
    window.addEventListener(AI_CONSENT_REQUEST_EVENT, ask);
    const restoreFetch = installAiConsentFetchGuard();
    return () => {
      window.removeEventListener(AI_CONSENT_REQUEST_EVENT, ask);
      restoreFetch();
    };
  }, [native]);

  if (!native) return null;

  const privacyHref = publicPathForLocale(routeByKey("privacy"), supportedLocaleForTag(locale) ?? "en");
  const answer = (value: AiConsent) => {
    answerConsent(value);
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm text-muted-foreground">
          {t.rich("retention", {
            privacy: (chunks) => (
              <a href={privacyHref} className="underline underline-offset-2">
                {chunks}
              </a>
            ),
          })}
        </p>
        <p className="text-sm text-muted-foreground">{t("declineNote")}</p>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => answer("declined")}>{t("decline")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => answer("granted")}>{t("allow")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
