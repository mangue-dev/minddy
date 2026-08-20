const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254);
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return /^(?:fc|fd)[0-9a-f]{2}:/.test(normalized) || /^fe[89ab][0-9a-f]:/.test(normalized);
}

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
    (LOOPBACK_HOSTS.has(hostname) || isPrivateIpv4(hostname) || isPrivateIpv6(hostname))
  ) {
    return url.origin;
  }
  if (url.protocol !== "https:") {
    throw new Error("Remote servers must use HTTPS. HTTP is allowed only on this computer or a private network IP.");
  }
  return url.origin;
}
