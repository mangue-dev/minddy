import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { pinnedRequest } from "@/lib/server/pinned-request";

/**
 * The only HTTP output allowed to a URL chosen by a user
 * (MIN-336, shared by MIN-341).
 *
 * Three things a bare `fetch` doesn't do:
 *
 * 1. **It refuses what is not publicly routable** — protocol other than http(s), `localhost`, private IP, link-local, CGNAT, reserved ranges,
 * and their IPv6 disguises (hex-mapped IPv4, 6to4, NAT64).
 * 2. **It connects to the address it validated**, not to the name: the
 * resolution is done once and pinned to the socket
 * ([pinned-request.ts](./pinned-request.ts)). Without this, a double domain
 * DNS response passes the check and then reaches the internal network.
 * 3. **It limits what it swallows**: each redirect is revalidated, the body
 * is cut off at the byte cap DURING reading, and a global delay
 * holds over the entire string.
 *
 * What it is not: a general HTTP client. No POST, no body of
 * request, no cookies, no compression — we read pages and images.
 */

export type SafeFetchReason =
  /** The URL itself is unrecoverable: protocol, private host, dead DNS. */
  | "url"
  /** The host is legitimate but the request did not produce anything usable. */
  | "unreachable"
  /** The body exceeds the byte limit. */
  | "tooLarge";

export class SafeFetchError extends Error {
  constructor(public readonly reason: SafeFetchReason) {
    super(reason);
    this.name = "SafeFetchError";
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;

/** Cuts a pointed IPv4 into its four bytes, null if it is not one. */
function ipv4Octets(address: string): number[] | null {
  if (isIP(address) !== 4) return null;
  return address.split(".").map(Number);
}

/** Expands an IPv6 into its eight 16-bit groups, null if not one. Handles `::` and tail in dotted notation (`::ffff:127.0.0.1`). */
function ipv6Groups(address: string): number[] | null {
  if (isIP(address) !== 6) return null;
  let text = address;
  // One IPv4 in queue is worth two groups.
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (tail) {
    const octets = tail[1].split(".").map(Number);
    const hex = [
      ((octets[0] << 8) | octets[1]).toString(16),
      ((octets[2] << 8) | octets[3]).toString(16),
    ].join(":");
    text = `${text.slice(0, tail.index)}${hex}`;
  }
  const [head, rest] = text.split("::");
  const left = head ? head.split(":").filter(Boolean) : [];
  const right = rest ? rest.split(":").filter(Boolean) : [];
  const missing = 8 - left.length - right.length;
  if (rest === undefined) {
    if (left.length !== 8) return null;
    return left.map((g) => parseInt(g, 16));
  }
  if (missing < 0) return null;
  return [...left, ...Array<string>(missing).fill("0"), ...right].map((g) =>
    parseInt(g, 16)
  );
}

/**
 * The old IPv4 writes: `2130706433`, `0177.0.0.1`, `0x7f.1`.
 * `inet_aton` accepts them all — so the system resolver too, and
 * `curl`, and the browser — but `isIP` doesn't recognize any of them, so the
 * filter would mistake them for hostnames. We therefore bring them back to the pointed form
 * BEFORE deciding anything. One to four parts, each in
 * decimal, octal (prefix `0`), or hexadecimal (prefix `0x`); the last
 * absorbs the remaining bytes.
 */
export function legacyIpv4(host: string): string | null {
  if (isIP(host)) return null;
  const parts = host.split(".");
  if (parts.length > 4) return null;
  const values: number[] = [];
  for (const part of parts) {
    let value: number;
    if (/^0[xX][0-9a-fA-F]+$/.test(part)) value = parseInt(part.slice(2), 16);
    else if (/^0[0-7]+$/.test(part)) value = parseInt(part.slice(1), 8);
    else if (/^(0|[1-9][0-9]*)$/.test(part)) value = Number(part);
    else return null;
    if (!Number.isSafeInteger(value) || value < 0) return null;
    values.push(value);
  }
  // All parts except the last are worth one byte; the last one carries the
  // reste (`127.1` = `127.0.0.1`).
  const last = values.pop()!;
  if (values.some((v) => v > 0xff)) return null;
  const rest = 4 - values.length;
  if (last >= 2 ** (8 * rest)) return null;
  const octets = [...values];
  for (let i = rest - 1; i >= 0; i--) octets.push((last >>> (8 * i)) & 0xff);
  return octets.join(".");
}

/** An IPv4 embedded in two IPv6 groups. */
function embeddedIpv4(high: number, low: number): string {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

/**
 * Anything that is not routable on the public Internet is refused: private,
 * loopback, link-local, CGNAT, multicast, documentation and test ranges,
 * and — on the IPv6 side — the forms that dress up an IPv4 (mapped, 6to4, NAT64).
 * An address written `::ffff:c0a8:1` is `192.168.0.1`, and the filter that only reads
 * as the dotted form lets it pass.
 */
export function isPrivateAddress(address: string): boolean {
  // A link address sometimes carries its zone (`fe80::1%eth0`).
  const bare = address.split("%")[0];

  const octets = ipv4Octets(legacyIpv4(bare) ?? bare);
  if (octets) {
    const [a, b, c] = octets;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // lien-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
    if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
    if (a === 192 && b === 88 && c === 99) return true; // ancien relais 6to4
    if (a === 192 && b === 31 && c === 196) return true; // AS112
    if (a === 192 && b === 52 && c === 193) return true; // AMT
    if (a === 192 && b === 175 && c === 48) return true; // AS112 direct delegation
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
    if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
    if (a >= 224) return true; // multicast, reserved, broadcast
    return false;
  }

  const groups = ipv6Groups(bare);
  if (!groups) return false;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  if (groups.every((g) => g === 0)) return true; // ::
  if (groups.slice(0, 7).every((g) => g === 0) && g7 === 1) return true; // ::1
  if ((g0 & 0xff00) === 0xff00) return true; // multicast
  if ((g0 & 0xffc0) === 0xfe80) return true; // lien-local fe80::/10
  if ((g0 & 0xfe00) === 0xfc00) return true; // ULA fc00::/7
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return true; // discard
  // Teredo (2001::/32) carries TWO IPv4 in the address, including that of
  // client, obfuscated: rather than untangling them, we refuse the beach — like
  // the rest of 2001::/23, which is only the protocol assignment
  // (ORCHIDv2, benchmark…), and 3fff::/20, modern documentation.
  if (g0 === 0x2001 && (g1 & 0xfe00) === 0x0000) return true;
  if ((g0 & 0xfff0) === 0x3ff0) return true;
  // mapped IPv4 (::ffff:a.b.c.d) and compatible IPv4 (::a.b.c.d), under their
  // dotted form as in their hexadecimal form.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0) {
    if (g5 === 0xffff || g5 === 0) return isPrivateAddress(embeddedIpv4(g6, g7));
  }
  if (g0 === 0x0064 && g1 === 0xff9b) return isPrivateAddress(embeddedIpv4(g6, g7)); // NAT64
  if (g0 === 0x2002) return isPrivateAddress(embeddedIpv4(g1, g2)); // 6to4
  return false;
}

/** An http(s) URL whose host is publicly routable, and the address to connect to. Raise `SafeFetchError("url")`. */
export interface ValidatedTarget {
  url: URL;
  address: string;
}

export async function assertPublicHttpUrl(raw: string | URL): Promise<ValidatedTarget> {
  let url: URL;
  try {
    url = raw instanceof URL ? raw : new URL(raw);
  } catch {
    throw new SafeFetchError("url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchError("url");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  // `0177.0.0.1` is not a hostname: it is `127.0.0.1` written differently, and
  // the resolver knows this. So we decide on the address, and we stick to it.
  const literal = isIP(host) ? host : legacyIpv4(host);
  if (literal) {
    if (isPrivateAddress(literal)) throw new SafeFetchError("url");
    return { url, address: literal };
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new SafeFetchError("url");
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new SafeFetchError("url");
  }
  // A single private address in the response is enough to refuse the host: serve
  // both is precisely the rebinding maneuver.
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new SafeFetchError("url");
  }
  return { url, address: addresses[0].address };
}

export interface SafeFetchOptions {
  /** Body byte cap, applied DURING reading. */
  maxBytes: number;
  /**
 * What we do when the body exceeds the ceiling. Default `"error"`: a truncated
 * file is not a file (a half-read image is a broken
 * image). `"truncate"` for what reads from the beginning — a page `<head>`
 * is in the first kilobytes, and throwing away the megabyte already received is like
 * losing the title of a site simply because it is big.
 */
  onOverflow?: "error" | "truncate";
  timeoutMs?: number;
  maxRedirects?: number;
  /** Request headers, including `user-agent`. */
  headers?: Record<string, string>;
  /** `GET` by default. */
  method?: "GET" | "POST";
  /**
 * Request body (POST). It is NOT replayed on a redirect: a
 * caller who station chooses `maxRedirects: 0` — follow a 302 with the same
 * signed load to a host that the caller has not chosen is not what we want from a webhook.
 */
  body?: string;
}

export interface SafeResponse {
  status: number;
  ok: boolean;
  headers: Headers;
  /** The final URL, redirects followed — the basis of relative hrefs. */
  url: URL;
  bytes: Buffer;
  /** The body has passed the ceiling and stops at `maxBytes`. */
  truncated: boolean;
}

export async function safeFetch(
  rawUrl: string | URL,
  options: SafeFetchOptions
): Promise<SafeResponse> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let target = await assertPublicHttpUrl(rawUrl);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let response;
    try {
      response = await pinnedRequest(target.url, {
        address: target.address,
        headers: {
          // No compression: we read a ceiling of bytes, and a body
          // compressed would lie about how much it costs to decompress.
          "accept-encoding": "identity",
          ...(options.body === undefined
            ? {}
            : { "content-length": String(Buffer.byteLength(options.body)) }),
          ...options.headers,
        },
        signal,
        method: options.method,
        body: hop === 0 ? options.body : undefined,
      });
    } catch {
      throw new SafeFetchError("unreachable");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      response.destroy();
      if (!location || hop === maxRedirects) throw new SafeFetchError("unreachable");
      let next: URL;
      try {
        next = new URL(location, target.url);
      } catch {
        throw new SafeFetchError("url");
      }
      // Each jump is a new host to validate and pin.
      target = await assertPublicHttpUrl(next);
      continue;
    }

    const body = await readCapped(response, options.maxBytes, options.onOverflow ?? "error");
    return {
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      headers: response.headers,
      url: target.url,
      bytes: body.bytes,
      truncated: body.truncated,
    };
  }
  throw new SafeFetchError("unreachable");
}

/** Beds a body in flow with height ceiling. The count is made on the
 bytes RECEIVED — a lying `content-length` does not raise the ceiling —
 and reading is cut off as soon as it is reached: nothing beyond that is
 downloaded, much less kept in memory. */
async function readCapped(
  response: { headers: Headers; stream: NodeJS.ReadableStream; destroy(): void },
  cap: number,
  onOverflow: "error" | "truncate"
): Promise<{ bytes: Buffer; truncated: boolean }> {
  const declared = Number(response.headers.get("content-length"));
  if (onOverflow === "error" && Number.isFinite(declared) && declared > cap) {
    response.destroy();
    throw new SafeFetchError("tooLarge");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;
  try {
    for await (const chunk of response.stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (total + buffer.byteLength > cap) {
        if (onOverflow === "error") {
          response.destroy();
          throw new SafeFetchError("tooLarge");
        }
        chunks.push(buffer.subarray(0, cap - total));
        truncated = true;
        break;
      }
      total += buffer.byteLength;
      chunks.push(buffer);
    }
  } catch (err) {
    response.destroy();
    if (err instanceof SafeFetchError) throw err;
    throw new SafeFetchError("unreachable");
  }
  response.destroy();
  return { bytes: Buffer.concat(chunks), truncated };
}
