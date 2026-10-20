/**
 * captures/ — time-based one-time codes (RFC 6238) for the capture admin.
 *
 * The admin console requires a session raised to aal2, so the capture admin
 * owns a TOTP factor like any administrator. Its secret lives in the local
 * `.env` only; this module turns it into the current six-digit code without a
 * dependency.
 */
import { createHmac } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD_SECONDS = 30;

/** Decodes an RFC 4648 base32 secret, ignoring case, spaces and padding. */
export function decodeBase32(secret) {
  const clean = String(secret).toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error("captures: the TOTP secret is not valid base32.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** The code for `timeMs`, SHA-1 and a 30-second step as Supabase Auth issues them. */
export function totpCode(secret, timeMs = Date.now(), digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timeMs / 1000 / TOTP_PERIOD_SECONDS)));
  const hmac = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** Milliseconds left before the current code expires. */
export function totpRemainingMs(timeMs = Date.now()) {
  const period = TOTP_PERIOD_SECONDS * 1000;
  return period - (timeMs % period);
}
