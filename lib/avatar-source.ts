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

/** External avatars and local upload previews must use image-fetching schemes. */
export function avatarImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    if (url.protocol === "blob:") {
      const origin = new URL(url.pathname);
      if (origin.protocol === "https:" || origin.protocol === "http:") return url.href;
    }
  } catch {
    // Invalid or relative external sources fall back to the account portrait.
  }
  return null;
}

/**
 * Portrait of a GitHub author, from their login alone. GitHub serves every
 * account's avatar at `github.com/<login>.png`; the login is checked against
 * GitHub's own username rules so mirrored text never becomes an arbitrary URL.
 * Bot accounts (`name[bot]`) and GitLab authors have no such route: null lets
 * the caller fall back to a generated portrait.
 */
export function githubAuthorAvatarUrl(
  provider: "github" | "gitlab" | null | undefined,
  login: string | null | undefined,
): string | null {
  if ((provider ?? "github") !== "github" || !login) return null;
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(login)) return null;
  return `https://github.com/${login}.png?size=80`;
}

/**
 * Whether a forge login is a bot account: GitHub suffixes app accounts with
 * `[bot]` (dependabot[bot]), and GitLab names project and group access-token
 * bots `project_<id>_bot…` / `group_<id>_bot…`. A bot's avatar is drawn
 * square, as the forges draw it, so it never passes for a person.
 */
export function isForgeBotLogin(login: string | null | undefined): boolean {
  if (!login) return false;
  return /\[bot\]$/i.test(login) || /^(?:project|group)_\d+_bot(?:_|$)/i.test(login);
}
