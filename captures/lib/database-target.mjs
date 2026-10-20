/**
 * captures/ — which database and which origin a capture script targets.
 *
 * Pure decisions, tested on their own: the scripts that create the capture
 * admin or open its session call them before touching anything.
 */
import { PRODUCTION_ORIGINS, PRODUCTION_SUPABASE_REFS } from "./config.mjs";

/** The project ref of a hosted Supabase URL (`https://<ref>.supabase.co`), or null. */
export function supabaseProjectRef(rawUrl) {
  const host = new URL(rawUrl).hostname.toLowerCase();
  const match = host.match(/^([a-z0-9]+)\.supabase\.(co|in)$/);
  return match ? match[1] : null;
}

/** Throws unless `rawUrl` is a Supabase project other than production. */
export function assertNonProductionDatabase(rawUrl, purpose) {
  const ref = supabaseProjectRef(rawUrl);
  if (ref && PRODUCTION_SUPABASE_REFS.includes(ref)) {
    throw new Error(
      `captures: ${purpose} is preview-only, but MINDDY_PUBLIC_SUPABASE_URL targets the production database. ` +
        "Point .env to the preview database (docs/database-environments.md).",
    );
  }
}

/** Throws when `rawUrl` is a Minddy Cloud production origin. */
export function assertNonProductionOrigin(rawUrl, purpose) {
  const origin = new URL(rawUrl).origin;
  if (PRODUCTION_ORIGINS.includes(origin)) {
    throw new Error(
      `captures: ${purpose} is preview-only; set CAPTURE_BASE_URL to https://preview.minddy.app or a local instance.`,
    );
  }
}
