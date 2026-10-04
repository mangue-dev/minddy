"use client";

import { useCallback, useMemo } from "react";
import { getAnalyticsClient, trackEvent } from "./analytics";
import { setAnalyticsContext, resetAnalyticsContext } from "./analytics-context";
import type { AnalyticsEventName, AnalyticsPropsFor } from "./analytics-events";

/**
 * Typed client-side product events (MIN-78). The runtime catalog and sanitizer
 * also reject unknown properties, non-primitive values and oversized strings.
 * Read the client at call time without importing the SDK into this hook's
 * initial public-page bundle (MIN-94). Context waits for cookie acceptance;
 * the SDK and consent guard handle event capture and hard refusal.
 */
export function useAnalytics() {
  // Delegates to `trackEvent`: a single implementation (catalog + allowlist +
  // sanitization) shared with non-React code, on the same client.
  const track = useCallback(
    <E extends AnalyticsEventName>(event: E, props?: AnalyticsPropsFor<E>) =>
      trackEvent(event, props),
    []
  );

  // ── State (identity, group, properties) ─────────────────────────────────
  // Retain current context until both SDK initialization and cookie acceptance.
  // Anonymous measurement never receives account/person/group context.

  /** Attaches the following events to an account (after login). */
  const identify = useCallback(
    (userId: string, traits?: Record<string, unknown>, traitsOnce?: Record<string, unknown>) => {
      setAnalyticsContext("identity", () => getAnalyticsClient()?.identify(userId, traits, traitsOnce));
    },
    []
  );

  /** Sign out: forget context and reset the accepted analytics identity. */
  const reset = useCallback(() => {
    resetAnalyticsContext();
  }, []);

  /**
   * Associate subsequent accepted events with a project for group analytics.
   * `resetGroups` clears this association when leaving the project.
   */
  const group = useCallback(
    (groupType: string, groupKey: string, props?: Record<string, unknown>) => {
      setAnalyticsContext(`group:${groupType}`, () => getAnalyticsClient()?.group(groupType, groupKey, props));
    },
    []
  );
  const resetGroups = useCallback(() => {
    resetAnalyticsContext(true);
  }, []);

  /**
   * Attach the current project as an event property for ordinary breakdowns,
   * independently of the project's Group Analytics configuration.
   */
  const setProjectContext = useCallback(
    (projectId: string | null) => {
      setAnalyticsContext("project", () => {
        const posthog = getAnalyticsClient();
        if (projectId) posthog?.register({ project_id: projectId });
        else posthog?.unregister("project_id");
      });
    },
    []
  );

  /** Preserve the first localized landing as a property on the acquisition funnel. */
  const setAcquisitionContext = useCallback((locale: string, path: string) => {
    setAnalyticsContext("acquisition", () => {
      getAnalyticsClient()?.register_once({
        acquisition_locale: locale,
        acquisition_landing_path: path,
      });
    });
  }, []);

  /**
   * Set accepted person properties through the native API because the event
   * sanitizer rejects reserved `$set` keys.
   */
  const setPersonProperties = useCallback(
    (set?: Record<string, unknown>, setOnce?: Record<string, unknown>) => {
      setAnalyticsContext("person", () => getAnalyticsClient()?.setPersonProperties(set, setOnce));
    },
    []
  );

  return useMemo(
    () => ({
      track,
      identify,
      reset,
      group,
      resetGroups,
      setProjectContext,
      setAcquisitionContext,
      setPersonProperties,
    }),
    [track, identify, reset, group, resetGroups, setProjectContext,
      setAcquisitionContext,
      setPersonProperties,
    ]
  );
}
