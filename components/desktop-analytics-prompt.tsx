"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "mangue-ui";
import { BarChart3 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { isDesktop } from "@/lib/desktop/bridge";
import {
  ANALYTICS_CONSENT_META_KEY,
  readConsent,
  resolveAnalyticsConsent,
  writeConsent,
  type CookieConsent,
} from "@/lib/cookie-consent";
import { useAnalytics } from "@/lib/use-analytics";

/**
 * The question of audience measurement, asked ONCE, in the desktop app
 * (MIN-291).
 *
 * The footer banner does not follow in the window: it is a site object
 * (see components/cookie-banner.tsx). But the only other door being the
 * adjustments, no one would ever have gone there on their own, and the measure would be
 * remained extinct for everyone without it being a choice. We therefore pose the
 * question, like an app: in the center, once, with two answers
 * frank — and we never return to it.
 *
 * ## Three decisions that hold together
 *
 * **In the app, not on the login screen.** This component lives under the shell
 * authenticated: asking before the person has entered is asking
 * someone who isn't there yet.
 *
 * **No exit without response** — no cross, no escape, no click next to it. This is not
 * not to force the hand: the two answers are side by side and of the same weight.
 * This is so that the question does not arise again at the next launch, which
 * would transform into harassment — the very defect of the blindfolds that are being replaced.
 *
 * **And it remains reversible**, in the settings, what the dialogue says
 * himself rather than leaving him guessing.
 *
 * ## “Once” means once, and local storage was not enough
 *
 * The choice lived in the only localStorage. In a browser, it holds — it
 * keeps its storage forever. Here, no: the question came up every time
 * launch, and at each reconnection. A new profile, a reinstallation, a
 * dev shell, and the blocking modal started from scratch. This is exactly the
 * harassment that the third point above purported to avoid.
 *
 * The choice is therefore ALSO written in the account (`user_metadata`), and this
 * This screen reads it first: a device without local choice but whose account in
 * wears one ADOPTS it silently, without asking again. See lib/cookie-consent.ts for
 * the sharing of roles between the two storages.
 */
export function DesktopAnalyticsPrompt() {
  const t = useTranslations("Analytics");
  const { track } = useAnalytics();
  const { user, updateUserMetadata } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // After editing: neither the bridge nor the local storage exists when rendered
    // server, and assuming them would cause the hydration to diverge.
    if (!isDesktop() || readConsent() !== null) return;
    // The session arrives after the first rendering: as long as it is not there, we
    // does not yet know if the question is already answered, and asking it would be
    // Ask it to someone who may have already answered it.
    if (!user) return;
    const fromAccount = resolveAnalyticsConsent(user.user_metadata);
    // Adopted on this device: `writeConsent` immediately warns PostHog,
    // therefore the measurement leaves (or remains cut) without reloading or question.
    if (fromAccount) writeConsent(fromAccount);
    else setOpen(true);
  }, [user]);

  const choose = (consent: CookieConsent) => {
    // Tracked BEFORE `writeConsent`, like the banner: on a refusal, this one
    // cut the capture and the event would no longer leave. So he leaves in the
    // pre-choice mode — anonymous, without writing anything to the device.
    track("cookie_consent_choice", { choice: consent });
    writeConsent(consent);
    setOpen(false);
    // The account, so that the question does not arise on the next profile.
    // Detached voluntarily: the screen is already closed, and a network failure does not
    // must not reopen a blocking modal on a choice already made here.
    void updateUserMetadata({ [ANALYTICS_CONSENT_META_KEY]: consent }).catch(
      (e: unknown) => console.error("[analytics] consentement non enregistré:", e)
    );
  };

  if (!open) return null;

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-[calc(100%-2rem)] sm:max-w-[420px]"
      >
        <div className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <BarChart3 className="size-4" />
        </div>
        <DialogTitle className="mt-3 text-base">{t("promptTitle")}</DialogTitle>
        <DialogDescription className="leading-relaxed">
          {t("description")} {t("promptSettingsHint")}
        </DialogDescription>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => choose("declined")}>
            {t("promptDecline")}
          </Button>
          <Button onClick={() => choose("accepted")}>{t("promptAccept")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
