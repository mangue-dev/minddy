/**
 * Minddy service worker — push notifications, and NOTHING ELSE (MIN-183).
 *
 * ⚠ NO `fetch` HANDLER. This is deliberate and it's important: as soon as a
 * service worker intercepts `fetch` *, it becomes responsible for what the
 * browser displays, and the slightest cache error serves stale HTML to people who have no way of getting out of it (clearing a site's cache doesn't se
 * not found). minddy doesn't need offline mode; it needs
 * to receive pushes. A worker that only does that cannot break the page.
 *
 * STATIC file in `public/`, served at the original root: it gets
 * scope `/` without header `Service-Worker-Allowed`. The proxy matcher already excludes
 * `.js`, there is no whitelist to add. Its headers (MIME type,
 * no cache) are placed in next.config.mjs.
 *
 * Written in JS without build: this file is served AS IS. No import, no
 * syntax that would need to be transpiled.
 */

/** Manifest icons — the only ones the repository ships. */
const ICON = "/web-app-manifest-192x192.png";

self.addEventListener("push", (event) => {
  // `userVisibleOnly: true` is the subscription contract: a push which
  // displays NOTHING, loses permission after a few occurrences
  // (Chrome then displays a notification “this site is running in the background”).
  // Hence the fallback: we always show something, even if the payload
  // is unreadable.
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch {
    data = {};
  }

  const title = data.title || "minddy";
  const options = {
    body: data.body || "",
    // Declaring the content language lets the platform choose the matching
    // localization for surrounding system UI where supported.
    lang: data.lang || "",
    icon: ICON,
    badge: ICON,
    // The `tag` is the destination path: two notifications on the same
    // ticket REPLACES instead of stacking. `renotify: false` so that the
    // replacement is silent — the phone does not ring.
    tag: data.tag || "minddy",
    renotify: false,
    data: { url: data.url || "/inbox" },
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(notifyClients)
  );
});

/**
 * Warns open tabs that a notification has just been displayed, so that whoever is ALREADY looking at the page concerned closes it immediately
 * (components/push-notification-dismiss.tsx). Without this message, this case has
 * no signal: neither the route nor the visibility changes when the banner
 * falls under the eyes of someone who is in the right place.
 *
 * The worker does not decide anything and does not send any URL: it does not know what
 * each tab displays, and the reconciliation lives in a single copy, side
 * page (lib/push/dismiss.ts). Here we just wake everyone up.
 *
 * `includeUncontrolled: true` is MANDATORY: this worker does not have a handler
 * `fetch` and does not call `clients.claim()`, so it does not CONTROL any tab.
 * Without this flag, `matchAll` would make a list empty, always. An uncontrolled
 * client receives a `postMessage`.
 */
async function notifyClients() {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of windows) {
    client.postMessage({ type: "push-shown" });
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/inbox";
  const target = new URL(url, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // A minddy tab already open: we put it back in the foreground and we put it there
      // send, rather than opening a second tab of the same app.
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ("navigate" in client) {
          try {
            await client.navigate(target);
          } catch {
            // Safari refuses `navigate()` in certain cases: the tab is already
            // in the foreground, this is the main thing.
          }
        }
        return;
      }
      await self.clients.openWindow(target);
    })()
  );
});

/**
 * The browser can RUN a subscription on its own (expiration side
 * push service, change of keys). Without this handler, the device silently stops
 * receiving anything, and its line remains in the
 * settings pretending otherwise.
 *
 * The public key is fetched from `/api/push/vapid`: a service worker
 * does not have access to variables inlined in the client bundle.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint;

        const response = await fetch("/api/push/vapid");
        const { key } = await response.json();
        if (!key) return;

        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });

        const json = subscription.toJSON();
        await fetch("/api/account/push-subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            keys: json.keys,
            oldEndpoint: oldEndpoint || undefined,
            // The browser ran the subscription on its own: no one
            // didn't ask for anything. `refresh` tells the server to resume the state of
            // the old line (on/off, language) instead of putting everything back
            // default — a worker has no language switches or cookies.
            refresh: true,
          }),
        });
      } catch (e) {
        console.error("[sw] ré-abonnement échoué:", e);
      }
    })()
  );
});

/** `applicationServerKey` wants raw bytes; VAPID is transported as
 * base64url. Copied from lib/push/client.ts — a service worker doesn't matter. */
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = self.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
