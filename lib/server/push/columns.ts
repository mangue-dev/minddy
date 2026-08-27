import "server-only";

/**
 * What a route renders a push subscription — the list is here, once, because
 * what it DOES NOT have is the point.
 *
 * `p256dh` and `auth` are the keys to end-to-end encryption (RFC 8291):
 * of device SECRETS. Whoever holds them with the endpoint can push a
 * notification to that person. They therefore have nothing to do either in an
 * API response, nor in the GDPR export — and `select("*")` would put them there.
 *
 * `endpoint`, itself, exits: the client uses it to recognize “this
 * this device” in the list, comparing it to that of its own
 * `PushSubscription`. It is already known to the browser that reads it.
 */
export const PUSH_DEVICE_COLUMNS =
  "id, endpoint, transport, native_installation_id, device_label, locale, enabled, created_at, last_seen_at, last_push_at";
