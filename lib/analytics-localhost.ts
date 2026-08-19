/**
 * Hosts considered "development": PostHog is never initialized
 * on them, so that a `next dev` (or a custom domain test) does not pollute the
 * production statistics. See `components/posthog-init.tsx`, which leaves
 * an exit gate (`MINDDY_PUBLIC_POSTHOG_ALLOW_LOCALHOST=1`) to check for
 * event wiring locally with a disposable key.
 *
 * `*.minddy.test` covers hosts pointed at 127.0.0.1 in /etc/hosts for
 * test custom domains (MIN-36) — they are indeed local URLs,
 * even if their name does not end with `.localhost`.
 */
/**
 * Should SERVER events originate from this environment?
 *
 * Counterpart to `isLocalAnalyticsHostname`, which only protects the browser. The
 * server does not have `location.hostname`: it is located at `VERCEL_ENV`, absent
 * locally (see `getAppEnv`). Without this guard, cutting the localhost
 * flag would silence the client but would let `issue_created_server`,
 * `user_signed_up`, `agent_run_started`… continue to go from a `pnpm dev`
 * to the production project — a pollution invisible, and all the more
 * misleading since it is precisely the events which are authoritative.
 */
export function shouldSendServerAnalytics(params: {
  hasKey: boolean;
  appEnv: string;
  allowLocalhost: boolean;
}): boolean {
  if (!params.hasKey) return false;
  // Production and preview always send: these are real users.
  if (params.appEnv !== "development") return true;
  // Locally, only if you have explicitly asked to check the cabling.
  return params.allowLocalhost;
}

export function isLocalAnalyticsHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  // A literal IPv6 address comes in square brackets in `location.hostname`.
  const host =
    normalized.startsWith("[") && normalized.endsWith("]")
      ? normalized.slice(1, -1)
      : normalized;

  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host === "minddy.test" ||
    host.endsWith(".minddy.test")
  );
}
