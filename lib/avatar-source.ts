/** Prefix distinguishing an uploaded image URL from a Lorelei seed. */
const UPLOADED_AVATAR_PREFIX = "uploaded:";
/** Public bucket containing normalized user avatar images. */
export const USER_AVATAR_BUCKET = "user-avatars";

/** Encodes a same-origin avatar route for legacy avatar-seed fields. */
export function uploadedAvatarSource(path: string): string {
  return `${UPLOADED_AVATAR_PREFIX}${path}`;
}

/**
 * Extracts a same-origin avatar path and rejects arbitrary external sources.
 * Public feedback pseudonyms also reach the avatar renderer as seeds, so merely
 * checking for `https:` would turn user-controlled text into a tracking request.
 */
export function uploadedAvatarUrl(source: string | null | undefined): string | null {
  if (!source?.startsWith(UPLOADED_AVATAR_PREFIX)) return null;
  try {
    const value = source.slice(UPLOADED_AVATAR_PREFIX.length);
    if (!value.startsWith("/")) return null;
    const url = new URL(value, "https://minddy.invalid");
    if (!/^\/api\/avatars\/[0-9a-f-]{36}$/i.test(url.pathname)) {
      return null;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
