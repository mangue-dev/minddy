"use client";

import { useEffect } from "react";
import { isLocalAnalyticsHostname } from "@/lib/analytics-localhost";
import {
  getAnalyticsClient,
  markAnalyticsReady,
  setAnalyticsClient,
} from "@/lib/analytics";
import { CONSENT_CHANGED_EVENT, COOKIE_CONSENT_KEY, readConsent } from "@/lib/cookie-consent";
import { analyticsConsentConfig, applyAnalyticsConsent } from "@/lib/analytics-consent";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";

/**
 * Load PostHog after idle without adding its SDK to the initial bundle.
 * Pending consent uses page memory, or server-hashed anonymous measurement when
 * explicitly enabled. Acceptance permits persistent account-linked measurement.
 * Refusal stops every browser event, including pageviews and Web Vitals.
 * DOM autocapture and session replay stay disabled; error tracking is opt-in.
 */

const IDLE_TIMEOUT_MS = 800;
const FALLBACK_DELAY_MS = 600;

type IdleWindow = typeof window & {
  requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function PostHogInit() {
  const { posthog } = useRuntimeConfig();
  useEffect(() => {
    // Release pending callbacks when analytics is disabled; they find no client.
    const key = posthog.key;
    const host = posthog.host;
    if (!key || !host) {
      markAnalyticsReady();
      return;
    }

    // Local traffic is ignored by default so as not to pollute the stats.
    // `MINDDY_PUBLIC_POSTHOG_ALLOW_LOCALHOST=1` (with a disposable key) allows you to
    // check the wiring in dev. Leave disabled everywhere else.
    const allowLocalhost = posthog.allowLocalhost;
    if (!allowLocalhost && isLocalAnalyticsHostname(window.location.hostname)) {
      markAnalyticsReady();
      return;
    }

    let initialized = false;
    // Ignore an import that resolves after unmount, including StrictMode cleanup.
    let cancelled = false;
    // Read before the lazy import: inside the callback, `posthog` names the
    // SDK module, not the runtime config.
    const posthogConfig = posthog;
    const errorTracking = posthog.errorTracking;

    let lastConsent = readConsent();
    const applyConsent = () => {
      const client = getAnalyticsClient();
      if (!client) return;
      const consent = readConsent();
      if (consent === lastConsent) return;
      const previous = lastConsent;
      lastConsent = consent;
      applyAnalyticsConsent(client, consent, posthog.cookieless === true);
      if (previous === "declined" && consent !== "declined") client.capture("$pageview");
    };

    const initPostHog = () => {
      // Keep the SDK out of the initial public-page bundle (MIN-94).
      void import("posthog-js").then(({ default: posthog }) => {
        if (cancelled) return;
        // Register before initialization so consent listeners can find the client.
        setAnalyticsClient(posthog);
        // Honor a banner choice made while the SDK chunk was downloading.
        const consent = readConsent();
        posthog.init(key, {
          api_host: host,
          capture_pageleave: true,
          person_profiles: "identified_only",
          autocapture: false,
          disable_session_recording: true,
          capture_exceptions: errorTracking
            ? {
                capture_unhandled_errors: true,
                capture_unhandled_rejections: true,
                capture_console_errors: false,
              }
            : false,
          ...analyticsConsentConfig(consent, posthogConfig.cookieless === true),
          loaded: () => {
            lastConsent = readConsent();
            applyAnalyticsConsent(posthog, lastConsent, posthogConfig.cookieless === true, false);
            initialized = true;
            // Restore accepted account context before the SDK's initial pageview.
            markAnalyticsReady();
          },
        });
      });
    };

    const onConsentChanged = () => {
      // Deferred initialization reads the latest choice before starting capture.
      if (initialized) applyConsent();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === COOKIE_CONSENT_KEY || event.key === null) onConsentChanged();
    };
    window.addEventListener(CONSENT_CHANGED_EVENT, onConsentChanged);
    window.addEventListener("storage", onStorage);

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
      window.removeEventListener("storage", onStorage);
      if (idleHandle !== null && typeof win.cancelIdleCallback === "function") {
        win.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
    };
  }, [posthog]);

  return null;
}
