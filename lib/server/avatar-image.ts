import "server-only";

import sharp from "sharp";
import { createAvatar } from "@dicebear/core";
import * as lorelei from "@dicebear/lorelei";
import { AVATAR_BACKGROUNDS } from "@/lib/avatar";
import { uploadedAvatarUrl } from "@/lib/avatar-source";

/**
 * A person's avatar as an image a mail client can show (MIN-963): the inviter
 * in the invitation email, drawn before their name like a member mention.
 *
 * The app draws Lorelei portraits as SVG `data:` URIs (`lib/avatar.ts`), which
 * mail clients do not display. `app/og/avatar` paints the same portrait as a
 * round PNG instead; an imported photo already has a public address
 * (`/api/avatars/<user>`), used as is.
 *
 * Lorelei seeds are opaque UUIDs (`public.user_avatars`), not account ids, so
 * the portrait's URL says nothing about who the person is.
 */

/** Display size of the avatar in the email title, in CSS pixels. */
export const AVATAR_IMAGE_CSS_SIZE = 24;
const AVATAR_IMAGE_PX = AVATAR_IMAGE_CSS_SIZE * 2;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAvatarImageSeed(seed: string | null | undefined): seed is string {
  return !!seed && UUID_RE.test(seed);
}

/**
 * The image path of an avatar source (`fetchAvatarSeeds`), relative to the site
 * origin, or `null` when it is neither a Lorelei seed nor an imported photo.
 */
export function avatarImagePath(source: string | null | undefined): string | null {
  const uploaded = uploadedAvatarUrl(source);
  if (uploaded) return uploaded;
  if (isAvatarImageSeed(source)) return `/og/avatar?s=${source}`;
  return null;
}

/**
 * The Lorelei portrait of a seed as a round PNG, twice the email size. The
 * circle is in the image's alpha, so Outlook, which ignores `border-radius`,
 * still shows a round avatar.
 */
export async function renderAvatarPng(seed: string): Promise<Buffer> {
  const svg = createAvatar(lorelei, {
    seed,
    backgroundColor: AVATAR_BACKGROUNDS,
    size: AVATAR_IMAGE_PX,
  }).toString();
  const half = AVATAR_IMAGE_PX / 2;
  const circle = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${AVATAR_IMAGE_PX}" height="${AVATAR_IMAGE_PX}"><circle cx="${half}" cy="${half}" r="${half}" fill="#fff"/></svg>`,
  );
  return sharp(Buffer.from(svg))
    .resize(AVATAR_IMAGE_PX, AVATAR_IMAGE_PX)
    .composite([{ input: circle, blend: "dest-in" }])
    .png()
    .toBuffer();
}
