"use client";

import { useCallback, useMemo } from "react";
import { getAnalyticsClient, onAnalyticsReady, trackEvent } from "./analytics";
import type { AnalyticsEventName, AnalyticsPropsFor } from "./analytics-events";

/**
 * The SINGLE entry point for client-side analytics events (MIN-78).
 *
 * `track` is generic on the catalog: an invented name or a prop outside
 * contract is a COMPILATION error, not a silently lost event.
 * The runtime allowlist remains in net (a `as any` somewhere, dynamic code
 *) and the sanitization guarantees that no non-primitive value nor
 * any text that is too long is left.
 *
 * All methods are safe when PostHog is not initialized (not from
 * key, localhost, consent denied): `getAnalyticsClient()` then returns
 * `null` and calls do nothing.
 *
 * Client is READ at call time, never captured by a hook (MIN-94) :
 * going through `usePostHog()` required importing `posthog-js/react` here, therefore
 * embedding the 227 KB of the client in the initial bundle of each public page
 * — this hook is mounted up to the cookies banner of the root layout.
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
  // These calls are DEFERRED until PostHog init via `onAnalyticsReady`.
  // Without that they arrived too early and got lost: Supabase issues
  // `INITIAL_SESSION` upon mounting, while the init waits for the browser
  // be inactive — the user therefore remained anonymous for the entire session.

  /** Attaches the following events to an account (after login). */
  const identify = useCallback(
    (userId: string, traits?: Record<string, unknown>, traitsOnce?: Record<string, unknown>) => {
      onAnalyticsReady(() => getAnalyticsClient()?.identify(userId, traits, traitsOnce));
    },
    []
  );

  /** Disconnection: starts with a new anonymous identity. */
  const reset = useCallback(() => {
    onAnalyticsReady(() => getAnalyticsClient()?.reset());
  }, []);

  /**
 * Group Analytics — associates the following events with a project, so
 * can break down funnels and retention by project. `resetGroups`
 * cuts the association (exit from the project / disconnection).
 */
  const group = useCallback(
    (groupType: string, groupKey: string, props?: Record<string, unknown>) => {
      onAnalyticsReady(() => getAnalyticsClient()?.group(groupType, groupKey, props));
    },
    []
  );
  const resetGroups = useCallback(() => {
    onAnalyticsReady(() => getAnalyticsClient()?.resetGroups());
  }, []);

  /**
 * Current project attached as PROPERTY to all following events.
 *
 * Voluntary duplicate of the group: group analytics is a PAID add-on
 * at PostHog, while an event property is free and can be split
 * with a simple "breakdown". Without that, as long as we do not subscribe, the
 * project dimension would be present in the data but unusable.
 *
 * The group remains in parallel: it costs nothing as long as the add-on
 * is not activated (billing starts upon subscription, not upon sending),
 * and the day it would be, everything is already in place.
 */
  const setProjectContext = useCallback(
    (projectId: string | null) => {
      onAnalyticsReady(() => {
        const posthog = getAnalyticsClient();
        if (projectId) posthog?.register({ project_id: projectId });
        else posthog?.unregister("project_id");
      });
    },
    []
  );

  /**
 * Person properties at activation milestones (`first_issue_at`,
 * `mcp_connected`…). Goes through the native API rather than `track({ $set })`
 * because the sanitizer rejects keys prefixed with `$`.
 */
  const setPersonProperties = useCallback(
    (set?: Record<string, unknown>, setOnce?: Record<string, unknown>) => {
      onAnalyticsReady(() => getAnalyticsClient()?.setPersonProperties(set, setOnce));
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
      setPersonProperties,
    }),
    [track, identify, reset, group, resetGroups, setProjectContext, setPersonProperties]
  );
}
