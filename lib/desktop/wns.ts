/** WNS channels are bearer addresses and may only target Microsoft's push host. */
export function isWnsChannelUri(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (hostname === "notify.windows.com" || hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}

/** Accepts only the helper's bounded JSON response and a genuine WNS address. */
export function parseWnsHelperChannel(output: unknown): string | null {
  if (typeof output !== "string" || output.length > 64 * 1024) return null;
  try {
    const value = JSON.parse(output) as { channelUri?: unknown };
    return typeof value.channelUri === "string" && isWnsChannelUri(value.channelUri)
      ? value.channelUri
      : null;
  } catch {
    return null;
  }
}
