/**
 * The version as it reads: `0.8.9` placed on its tag, `0.8.9-3` three
 * commits later.
 *
 * The number can be read without instructions - that's all we ask of it. A
 * letter (A, B, C… AA, AB) was shorter, but you had to know the
 * decode, and an indicator that must be decoded indicates nothing.
 *
 * 0 (or a value that is not a positive integer) returns nothing: the
 * deployment is POSED on its version, there is nothing to add behind it.
 */
export function formatAppVersion(version: string, count: number): string {
  if (!Number.isFinite(count)) return version;
  const n = Math.floor(count);
  return n > 0 ? `${version}-${n}` : version;
}

/**
 * The version as displayed in the account menu.
 *
 * `NEXT_PUBLIC_APP_VERSION` (package.json's version) and
 * `NEXT_PUBLIC_VERSION_COMMITS` are inlined in the build by `next.config.mjs`
 * (see `scripts/commits-since-version.mjs` for the measurement and its condition:
 * `VERCEL_DEEP_CLONE=1` on Vercel). Absent or illegible → bare version.
 */
export const APP_VERSION = formatAppVersion(
  process.env.NEXT_PUBLIC_APP_VERSION ?? "",
  Number(process.env.NEXT_PUBLIC_VERSION_COMMITS ?? "0")
);
