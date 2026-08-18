import "server-only";

import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";

/**
 * An HTTP request that connects to the IP address given to it (MIN-336).
 *
 * This is the building block that `fetch` is missing: we can give it a URL, not a
 * destination. Checking the DNS then calling `fetch` * lets a second
 * resolution occur, and a domain that responds to two different
 * addresses (one public for control, one private for connection) passes through the
 * guardrail without triggering it — that's DNS rebinding, a TOCTOU on the
 * resolver.
 *
 * `node:http` accepts a `lookup` function: the host name remains that
 * of the URL (so the `Host` header and the TLS SNI are correct, the certificate is
 * validated against the real domain) but the socket goes to the address that we have
 * validated, and to it alone.
 *
 * The guardrail which decides on this address lives in
 * [safe-fetch.ts](./safe-fetch.ts) — here we only obey.
 */

export interface PinnedResponse {
  status: number;
  headers: Headers;
  /** Body in flow: read with a cap, or discard by `destroy()`. */
  stream: NodeJS.ReadableStream;
  destroy(): void;
}

export interface PinnedRequestOptions {
  /** The validated IP address. The socket will not talk to anyone else. */
  address: string;
  headers: Record<string, string>;
  signal: AbortSignal;
  /** `GET` by default. */
  method?: string;
  /** Request body, for methods that carry one. */
  body?: string | Buffer;
}

export function pinnedRequest(
  url: URL,
  { address, headers, signal, method = "GET", body }: PinnedRequestOptions
): Promise<PinnedResponse> {
  const transport = url.protocol === "https:" ? https : http;
  const family = isIP(address);

  // Node calls `lookup` with `{ all: true }` depending on the paths; both
  // callback forms must respond to the same address.
  const lookup = ((hostname, options, callback) => {
    if ((options as { all?: boolean }).all) {
      (callback as unknown as (
        err: null,
        addresses: { address: string; family: number }[]
      ) => void)(null, [{ address, family }]);
    } else {
      callback(null, address, family);
    }
  }) as LookupFunction;

  return new Promise<PinnedResponse>((resolve, reject) => {
    const request = transport.request(
      {
        protocol: url.protocol,
        // The brackets in an IPv6 literal belong to the URL, not the API.
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        lookup,
        signal,
        // Without that, the global agent pools sockets by host name: one
        // connection already open to an unvalidated address would be reused
        // and our `lookup` would never be called.
        agent: false,
      },
      (response) => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (value == null) continue;
          for (const one of Array.isArray(value) ? value : [value]) {
            responseHeaders.append(name, one);
          }
        }
        resolve({
          status: response.statusCode ?? 0,
          headers: responseHeaders,
          stream: response,
          destroy: () => response.destroy(),
        });
      }
    );
    request.on("error", reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}
