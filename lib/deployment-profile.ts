export type DeploymentProfileEnvironment = Record<string, string | undefined>;

const MINDDY_HOST = "minddy.app";

export function isMinddyCloudHostname(value: string | undefined): boolean {
  const host = value?.trim().toLowerCase();
  return host === MINDDY_HOST || Boolean(host?.endsWith(`.${MINDDY_HOST}`));
}

function hostname(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Compatibility profile for the existing hosted product.
 *
 * Vercel alone is deliberately insufficient: an operator deploying this repo
 * on Vercel must keep every proprietary integration opt-in. The fallback only
 * applies when Vercel also identifies the canonical minddy.app deployment.
 */
export function isOfficialMinddyCloud(env: DeploymentProfileEnvironment): boolean {
  if (env.VERCEL?.trim() !== "1") return false;
  const host = hostname(env.NEXT_PUBLIC_APP_URL) ?? hostname(env.VERCEL_PROJECT_PRODUCTION_URL);
  return isMinddyCloudHostname(host ?? undefined);
}

export const LEGACY_MINDDY_FEEDBACK_FROM = "minddy <feedback@mail.minddy.app>";
export const LEGACY_MINDDY_INVITATION_FROM = "minddy <invites@mail.minddy.app>";
export const LEGACY_MINDDY_VAPID_SUBJECT = "mailto:hello@minddy.app";
export const LEGACY_MINDDY_APNS_BUNDLE_ID = "app.minddy.desktop";
