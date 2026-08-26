const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Validates and normalizes an origin entered in the desktop server picker. */
export function normalizeDesktopServerOrigin(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Enter the server address, including https://.");
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Enter a complete address, such as https://minddy.example.com.");
  }

  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Enter the server origin only, without a path, query, or credentials.");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol === "http:" &&
    LOOPBACK_HOSTS.has(hostname)
  ) {
    return url.origin;
  }
  if (url.protocol !== "https:") {
    throw new Error("Remote servers must use HTTPS. HTTP is allowed only on this computer.");
  }
  return url.origin;
}
