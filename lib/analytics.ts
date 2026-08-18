import type { PostHog } from "posthog-js";
import {
  sanitizeAnalyticsEventName,
  sanitizeAnalyticsProps,
} from "./analytics-sanitize";
import {
  ALLOWED_ANALYTICS_EVENTS,
  type AnalyticsEventName,
  type AnalyticsPropsFor,
} from "./analytics-events";

/**
 * The PostHog client, once loaded (MIN-94).
 *
 * `posthog-js` weighs 227 KB uncompressed: import it statically here the
 * put in the initial bundle of ALL public pages, via the chain
 * `cookie-banner` → `use-analytics` → this module. It is now loaded by a
 * `import()` in `components/posthog-init.tsx`, which drops the client here — this
 * file only keeps one type, erased at compilation.
 *
 * As long as nothing is dropped (no key, localhost, chunk not yet
 * downloaded), the reference remains `null` and all calls are inert:
 * exactly the contract from before, where they were tapping on an uninitialized singleton
 *.
 */
let client: PostHog | null = null;

/** Called by `PostHogInit` just before `posthog.init()`. */
export function setAnalyticsClient(instance: PostHog): void {
  client = instance;
}

/** The loaded client, or `null` — to be reread on each call, never to be memorized. */
export function getAnalyticsClient(): PostHog | null {
  return client;
}

/**
 * Emitting an analytics event OUTSIDE the React component (MIN-78).
 *
 * `useAnalytics()` covers components; a lot of interesting actions
 * live on the other hand in the API layer (`lib/*-api.ts`) or in a store
 * zustand — code without hooks. Both target the same client, with exactly
 * the same guarantees: typed catalog, allowlist runtime, sanitization of
 * props.
 *
 * No effect if PostHog is not initialized (no key, local host, refusal
 * cookies) or if the call comes from the server — server routes go through
 * `lib/server/posthog.ts`.
 */
/**
 * Is PostHog initialized? (MIN-78)
 *
 * The init is DELAYED (`requestIdleCallback`, up to 800 ms), but the identity
 * arrives BEFORE: Supabase issues `INITIAL_SESSION` upon mounting, and the current project
 * is known from the first URL. Without a queue, these calls
 * were sent to an uninitialized client and were lost — the user
 * remained anonymous throughout the session, and no more funnels per account were
 * calculable.
 *
 * Both types of call therefore wait for init rather than get lost:
 * - STATE (identity, group, person properties) is REPLAYED here. This
 * is not a dated event but a context: applying it with a few
 * hundreds of milliseconds of delay is correct, losing it is not;
 * - EVENTS (`trackEvent`) are queued and replayed WITH their
 * timestamp (MIN-150 — see `pendingEvents`). They used to be
 * previously not, and it cost all the "seen" events.
 *
 * The order of replay matters: identity FIRST, events THEN, so that
 * an event queued before knowing the account still leaves
 * under the voucher `distinct_id`.
 */
let analyticsReady = false;
const readyWaiters = new Set<() => void>();

/** Called by `PostHogInit` after `posthog.init()` has passed. */
export function markAnalyticsReady(): void {
  if (analyticsReady) return;
  analyticsReady = true;
  // Copy before iteration: a callback can record another.
  // oxlint-disable-next-line unicorn/no-useless-spread
  for (const cb of [...readyWaiters]) {
    readyWaiters.delete(cb);
    cb();
  }
  // After the identity, never before: see the header.
  flushPendingEvents();
}

/**
 * Runs `cb` as soon as PostHog is ready — immediately if it is already.
 * Returns a rollback function (to be called on unmount).
 */
export function onAnalyticsReady(cb: () => void): () => void {
  if (analyticsReady) {
    cb();
    return () => {};
  }
  readyWaiters.add(cb);
  return () => readyWaiters.delete(cb);
}

/**
 * Events emitted BEFORE init, waiting for their client (MIN-150).
 *
 * They were thrown away, and this was written as an assumed cost of loading
 * deferred. The measure decided otherwise: `landing_viewed` is issued at the mounting
 * of EACH visit to the landing, and PostHog had not received a single one in
 * 180 days — when `cookie_consent_choice` (9) and `landing_cta_clicked` (3),
 * them, arrived during the same period. Nothing random about it: a
 * edit effect always comes before a `requestIdleCallback`, a click always
 * after. So it wasn't "a few events lost at startup", it was a whole CATEGORY of events — the "seen" ones — that didn't exist, and the first step in the acquisition funnel with it. would distort its
 * timestamp") had an answer in the API: `capture` accepts the time in
 * third argument. We therefore keep the emission time, not the replay time.
 *
 * The queue is limited: beyond that, a tab which never initializes PostHog (no key, refusal of cookies) would accumulate endlessly. Twenty is enough — that's already
 * more events than a page emits before being interactive.
 */
const MAX_PENDING_EVENTS = 20;
const pendingEvents: {
  event: string;
  props: Record<string, unknown> | undefined;
  at: Date;
}[] = [];

/** Replays the queue on the freshly initialized client, then empties it. */
function flushPendingEvents(): void {
  const queued = pendingEvents.splice(0, pendingEvents.length);
  const posthog = getAnalyticsClient();
  // No client (no key, local host): the queue empties without leaving.
  if (!posthog?.__loaded) return;
  for (const { event, props, at } of queued) {
    posthog.capture(event, props, { timestamp: at });
  }
}

export function trackEvent<E extends AnalyticsEventName>(
  event: E,
  props?: AnalyticsPropsFor<E>
): void {
  if (typeof window === "undefined") return;
  const safeEvent = sanitizeAnalyticsEventName(event);
  if (!safeEvent || !ALLOWED_ANALYTICS_EVENTS.has(safeEvent as AnalyticsEventName)) return;
  const safeProps = sanitizeAnalyticsProps(props as Record<string, unknown> | undefined);

  // The init is deferred (see components/posthog-init.tsx): what happens
  // before she waits her turn instead of disappearing.
  const posthog = getAnalyticsClient();
  if (!posthog?.__loaded) {
    if (pendingEvents.length < MAX_PENDING_EVENTS) {
      pendingEvents.push({ event: safeEvent, props: safeProps, at: new Date() });
    }
    return;
  }
  posthog.capture(safeEvent, safeProps);
}
