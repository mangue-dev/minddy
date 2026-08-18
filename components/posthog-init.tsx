"use client";

import { useEffect } from "react";
import { isLocalAnalyticsHostname } from "@/lib/analytics-localhost";
import {
  getAnalyticsClient,
  markAnalyticsReady,
  setAnalyticsClient,
} from "@/lib/analytics";
import { CONSENT_CHANGED_EVENT, readConsent } from "@/lib/cookie-consent";
import { isMinddyCloudHostname } from "@/lib/deployment-profile";

/**
 * PostHog initialization (MIN-78).
 *
 * DELAYED, and now LAZY (MIN-94). The init script and the roundtrip
 * to eu.i.posthog.com burden the LCP; we wait until the browser is
 * inactive (`requestIdleCallback`, with a fallback `setTimeout` for Safari
 * old), and the client itself — 227 KB uncompressed — is only DOWNLOADED
 * at that moment, by a `import()`. Without a key, or on a local host, the
 * chunk is never requested. Assumed consequence: the very first moments
 * of a visit are not instrumented — the actions that we measure arrive
 * well later.
 *
 * This component renders NOTHING and provides no context: the customer is deposited
 * in `lib/analytics.ts` (`setAnalyticsClient`), hence `useAnalytics()` and
 * `trackEvent()` reread it. This is what allows `posthog-js` to remain outside
 * of the initial bundle: no more modules loaded at the first rendering matter.
 *
 * CONSENT (contract set by `lib/cookie-consent.ts`, MIN-77) — three states:
 *
 * 1. NO CHOICE YET → ANONYMOUS and COOKIE-FREE capture
 * (`persistence: "memory"`). NOTHING is written on the device: neither cookie,
 * nor localStorage. Article 82 of the Data Protection Act targets the
 * reading/writing on the terminal, not the measurement itself — without storage,
 * prior consent is not triggered. The identity dies with
 * the tab: no overlap from one visit to another. Legal basis:
 * legitimate interest, non-identifying audience measurement.
 *
 * WHY. Without that we are blind to the majority of visitors to the
 * landing — those who never click the banner — that is to say
 * exactly the top of the acquisition funnel, where the
 * question “where do the registrations come from?” ".
 *
 * 2. "ACCEPT" → hot switch to `localStorage+cookie`: the identity
 * survives reloading, multi-session journeys become readable.
 *
 * 3. « REFUSE » → `opt_out_capturing()`: nothing goes, at all.
 *
 * The banner emits `CONSENT_CHANGED_EVENT`: we react without reloading.
 * The Confidentiality and Cookies pages describe these three states — keep them
 * synchronized with this file is part of the contract.
 *
 * MINIMIZATION. `autocapture: false` and `disable_session_recording: true`: on
 * ONLY sends catalog events, to sanitized props. No capture
 * Automatic DOM, no screen recording — user tickets and comments
 * should never pass through an analytics tool.
 */

const IDLE_TIMEOUT_MS = 800;
const FALLBACK_DELAY_MS = 600;

type IdleWindow = typeof window & {
  requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function PostHogInit() {
  useEffect(() => {
    // Analytics disabled (no key, or local traffic): we “unblock”
    // still the queue, otherwise each pending identify/group goes there
    // would accumulate without ever being emptied. The released callbacks do not find
    // no clients, therefore do nothing — this is the desired effect.
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ||
      (isMinddyCloudHostname(window.location.hostname) ? "https://eu.i.posthog.com" : "");
    if (!key || !host) {
      markAnalyticsReady();
      return;
    }

    // Local traffic is ignored by default so as not to pollute the stats.
    // `NEXT_PUBLIC_POSTHOG_ALLOW_LOCALHOST=1` (with a disposable key) allows you to
    // check the wiring in dev. Leave disabled everywhere else.
    const allowLocalhost = process.env.NEXT_PUBLIC_POSTHOG_ALLOW_LOCALHOST === "1";
    if (!allowLocalhost && isLocalAnalyticsHostname(window.location.hostname)) {
      markAnalyticsReady();
      return;
    }

    let initialized = false;
    // The import is asynchronous: cleaning can happen BEFORE its resolution.
    // Without this flag, double mounting StrictMode (dev) would initialize to
    // a component disassembled, and `posthog.init` would protest.
    let cancelled = false;

    const applyConsent = () => {
      const posthog = getAnalyticsClient();
      if (!posthog) return;
      const consent = readConsent();
      if (consent === "declined") {
        posthog.opt_out_capturing();
        return;
      }
      // A refusal can be revoked from the Cookies page: we resubmit the capture.
      if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing();
      if (consent === "accepted") {
        // Memory → persistent storage: identity now survives
        // reload. `set_config` is the only way supported after init.
        posthog.set_config({ persistence: "localStorage+cookie" });
      }
    };

    const initPostHog = () => {
      // `import()` rather than a static import: it is THIS point which takes out the
      // 227 KB of the initial bundle (MIN-94). All of the above — the key, the host
      // local, waiting for the idle — is evaluated without the chunk leaving.
      void import("posthog-js").then(({ default: posthog }) => {
        if (cancelled) return;
        // Deposited BEFORE the init: `applyConsent` (triggered by the banner) must
        // be able to target the customer as soon as he exists.
        setAnalyticsClient(posthog);
        // Reread HERE, and not before `await`: one click on the banner arrived
        // while downloading the chunk is thus caught.
        const consent = readConsent();
        posthog.init(key, {
          api_host: host,
          // `history_change` and not `true`: minddy is an SPA App Router, the
          // navigation goes through pushState. With `true`, we would only count one
          // only page seen per session — that of initial loading.
          capture_pageview: "history_change",
          capture_pageleave: true,
          person_profiles: "identified_only",
          autocapture: false,
          disable_session_recording: true,
          // We capture from the first visit, but as long as the banner is not
          // decided persistence remains IN MEMORY: nothing is written on
          // device and identity dies with the tab (see header).
          opt_out_capturing_by_default: false,
          persistence: consent === "accepted" ? "localStorage+cookie" : "memory",
        });
        initialized = true;
        if (consent === "declined") posthog.opt_out_capturing();
        // Replay the identity and group put on hold during deferred init
        // (see `onAnalyticsReady`) — otherwise the user remains anonymous.
        markAnalyticsReady();
      });
    };

    const onConsentChanged = () => {
      // The choice may fall BEFORE the end of the deferred init: in this case
      // `initPostHog` will read the fresh value from localStorage, nothing to do.
      if (initialized) applyConsent();
    };
    window.addEventListener(CONSENT_CHANGED_EVENT, onConsentChanged);

    const win = window as IdleWindow;
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;

    if (typeof win.requestIdleCallback === "function") {
      idleHandle = win.requestIdleCallback(initPostHog, { timeout: IDLE_TIMEOUT_MS });
    } else {
      timeoutHandle = window.setTimeout(initPostHog, FALLBACK_DELAY_MS);
    }

    return () => {
      cancelled = true;
      window.removeEventListener(CONSENT_CHANGED_EVENT, onConsentChanged);
      if (idleHandle !== null && typeof win.cancelIdleCallback === "function") {
        win.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
    };
  }, []);

  return null;
}
