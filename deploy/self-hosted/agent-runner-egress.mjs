import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

const defaultMaxRedirects = 3;
const redirectSensitiveHeaders = new Set(["authorization", "cookie", "proxy-authorization"]);

/**
 * SSRF-safe transport for the standalone self-hosted runner.
 *
 * The runner cannot import the Next.js server's safe-fetch module, so this
 * keeps the same two security boundaries beside the relay: reject every
 * non-public DNS answer and connect only to the exact address that passed the
 * check. Redirects return to both boundaries before another socket is opened.
 */
export class RelayEgressError extends Error {
  constructor(reason) {
    super(reason === "url" ? "LLM upstream URL is not publicly routable" : "LLM upstream is unreachable");
    this.name = "RelayEgressError";
    this.reason = reason;
    this.status = 502;
  }
}

function ipv4Octets(address) {
  if (isIP(address) !== 4) return null;
  return address.split(".").map(Number);
}

function ipv6Groups(address) {
  if (isIP(address) !== 6) return null;
  let text = address;
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
    return left.map((group) => parseInt(group, 16));
  }
  if (missing < 0) return null;
  return [...left, ...Array(missing).fill("0"), ...right].map((group) => parseInt(group, 16));
}

function legacyIpv4(host) {
  if (isIP(host)) return null;
  const parts = host.split(".");
  if (parts.length > 4) return null;
  const values = [];
  for (const part of parts) {
    let value;
    if (/^0[xX][0-9a-fA-F]+$/.test(part)) value = parseInt(part.slice(2), 16);
    else if (/^0[0-7]+$/.test(part)) value = parseInt(part.slice(1), 8);
    else if (/^(0|[1-9][0-9]*)$/.test(part)) value = Number(part);
    else return null;
    if (!Number.isSafeInteger(value) || value < 0) return null;
    values.push(value);
  }
  const last = values.pop();
  if (last === undefined || values.some((value) => value > 0xff)) return null;
  const remainingBytes = 4 - values.length;
  if (last >= 2 ** (8 * remainingBytes)) return null;
  const octets = [...values];
  for (let index = remainingBytes - 1; index >= 0; index--) {
    octets.push((last >>> (8 * index)) & 0xff);
  }
  return octets.join(".");
}

function embeddedIpv4(high, low) {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

function ipv4Payload(groups) {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0) {
    if (g5 === 0 || g5 === 0xffff) return embeddedIpv4(g6, g7);
  }
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0xffff && g5 === 0) {
    return embeddedIpv4(g6, g7);
  }
  if (g0 === 0x0064 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return embeddedIpv4(g6, g7);
  }
  if (g0 === 0x2002) return embeddedIpv4(g1, g2);
  return null;
}

export function isPrivateAddress(address) {
  const bare = address.split("%")[0];
  const octets = ipv4Octets(legacyIpv4(bare) ?? bare);
  if (octets) {
    const [a, b, c] = octets;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 192 && b === 0 && c === 0) return true;
    if (a === 192 && b === 0 && c === 2) return true;
    if (a === 192 && b === 88 && c === 99) return true;
    if (a === 192 && b === 31 && c === 196) return true;
    if (a === 192 && b === 52 && c === 193) return true;
    if (a === 192 && b === 175 && c === 48) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    return a >= 224;
  }

  const groups = ipv6Groups(bare);
  if (!groups) return false;
  const [g0, g1, g2, g3] = groups;
  const g7 = groups[7];
  if (groups.every((group) => group === 0)) return true;
  if (groups.slice(0, 7).every((group) => group === 0) && g7 === 1) return true;
  if ((g0 & 0xff00) === 0xff00) return true;
  if ((g0 & 0xffc0) === 0xfe80) return true;
  if ((g0 & 0xfe00) === 0xfc00) return true;
  if (g0 === 0x2001 && g1 === 0x0db8) return true;
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return true;
  if (g0 === 0x2001 && (g1 & 0xfe00) === 0x0000) return true;
  if ((g0 & 0xfff0) === 0x3ff0) return true;
  if (g0 === 0x0064 && g1 === 0xff9b && g2 === 1) return true;
  const payload = ipv4Payload(groups);
  return payload ? isPrivateAddress(payload) : false;
}

export async function assertPublicHttpUrl(raw, resolve = lookup) {
  let url;
  try {
    url = raw instanceof URL ? raw : new URL(raw);
  } catch {
    throw new RelayEgressError("url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new RelayEgressError("url");
  if (url.username || url.password) throw new RelayEgressError("url");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const literal = isIP(host) ? host : legacyIpv4(host);
  if (literal) {
    if (isPrivateAddress(literal)) throw new RelayEgressError("url");
    return { url, address: literal };
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new RelayEgressError("url");
  }

  let addresses;
  try {
    addresses = await resolve(host, { all: true });
  } catch {
    throw new RelayEgressError("url");
  }
  // Reject the entire hostname when even one answer is private. Accepting a
  // public answer and then connecting after another lookup enables rebinding.
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new RelayEgressError("url");
  }
  return { url, address: addresses[0].address };
}

function pinnedRequest(target, { method, headers, body, signal }) {
  const transport = target.url.protocol === "https:" ? httpsRequest : httpRequest;
  const family = isIP(target.address);
  // Keep the URL hostname for Host and TLS SNI, but make the socket use only
  // the address that assertPublicHttpUrl validated.
  const pinnedLookup = (hostname, options, callback) => {
    if (options.all) callback(null, [{ address: target.address, family }]);
    else callback(null, target.address, family);
  };

  return new Promise((resolve, reject) => {
    const request = transport({
      protocol: target.url.protocol,
      hostname: target.url.hostname.replace(/^\[|\]$/g, ""),
      port: target.url.port || (target.url.protocol === "https:" ? 443 : 80),
      path: `${target.url.pathname}${target.url.search}`,
      method,
      headers,
      lookup: pinnedLookup,
      signal,
      agent: false,
    }, (response) => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (value == null) continue;
        for (const item of Array.isArray(value) ? value : [value]) responseHeaders.append(name, item);
      }
      resolve({
        status: response.statusCode ?? 0,
        headers: responseHeaders,
        stream: response,
        destroy: () => response.destroy(),
      });
    });
    request.on("error", reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

export async function requestPublicUrl(raw, options, dependencies = {}) {
  const resolve = dependencies.lookup ?? lookup;
  const request = dependencies.request ?? pinnedRequest;
  const maxRedirects = options.maxRedirects ?? defaultMaxRedirects;
  let target = await assertPublicHttpUrl(raw, resolve);
  let method = options.method ?? "GET";
  let headers = new Headers(options.headers);
  let body = options.body === undefined ? undefined : Buffer.from(options.body);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    headers.set("accept-encoding", "identity");
    if (body === undefined) headers.delete("content-length");
    else headers.set("content-length", String(body.byteLength));

    let response;
    try {
      response = await request(target, {
        method,
        headers: Object.fromEntries(headers.entries()),
        body,
        signal: options.signal,
      });
    } catch {
      throw new RelayEgressError("unreachable");
    }

    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    response.destroy();
    if (!location || hop === maxRedirects) throw new RelayEgressError("unreachable");

    let next;
    try {
      next = new URL(location, target.url);
    } catch {
      throw new RelayEgressError("url");
    }
    if (next.origin !== target.url.origin) {
      for (const name of redirectSensitiveHeaders) headers.delete(name);
    }
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
      method = "GET";
      body = undefined;
      headers.delete("content-type");
    }
    target = await assertPublicHttpUrl(next, resolve);
  }
  throw new RelayEgressError("unreachable");
}
