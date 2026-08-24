import "server-only";

import webpush, {
  WebPushError,
  type Headers as WebPushHeaders,
  type PushSubscription,
  type RequestOptions,
  type SendResult,
} from "web-push";

import { safeFetch, SafeFetchError } from "@/lib/server/safe-fetch";

const RESPONSE_LIMIT_BYTES = 4_096;
const TIMEOUT_MS = 10_000;

function responseHeaders(headers: Headers): WebPushHeaders {
  return Object.fromEntries(headers.entries());
}

/**
 * Generates the encrypted Web Push request with `web-push`, then delivers it
 * through the same DNS validation and socket-pinning path used by other
 * user-configured outbound requests.
 *
 * Redirects are intentionally rejected. Besides allowing an endpoint to move
 * to an internal address, following one could disclose the encrypted payload
 * and its VAPID authorization to a destination that was never registered.
 */
export async function sendPinnedWebPushNotification(
  subscription: PushSubscription,
  payload: string | Buffer,
  options: RequestOptions,
): Promise<SendResult> {
  const details = webpush.generateRequestDetails(subscription, payload, options);

  let endpoint: URL;
  try {
    endpoint = new URL(details.endpoint);
  } catch {
    throw new SafeFetchError("url");
  }
  if (endpoint.protocol !== "https:") throw new SafeFetchError("url");

  const response = await safeFetch(endpoint, {
    method: details.method,
    headers: details.headers,
    body: details.body ?? undefined,
    maxBytes: RESPONSE_LIMIT_BYTES,
    onOverflow: "truncate",
    maxRedirects: 0,
    timeoutMs: TIMEOUT_MS,
  });
  const body = response.bytes.toString("utf8");
  const headers = responseHeaders(response.headers);

  if (!response.ok) {
    throw new WebPushError(
      "Received unexpected response code",
      response.status,
      headers,
      body,
      details.endpoint,
    );
  }

  return { statusCode: response.status, body, headers };
}
