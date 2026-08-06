/**
 * Service worker de minddy — notifications push, et RIEN D'AUTRE (MIN-183).
 *
 * ⚠ PAS DE HANDLER `fetch`. C'est délibéré et c'est important : dès qu'un
 * service worker intercepte `fetch`, il devient responsable de ce que le
 * navigateur affiche, et la moindre erreur de cache sert un HTML périmé à des
 * gens qui n'ont aucun moyen de s'en sortir (vider le cache d'un site ne se
 * trouve pas). minddy n'a pas besoin de mode hors-ligne ; il a besoin de
 * recevoir des push. Un worker qui ne fait que ça ne peut pas casser la page.
 *
 * Fichier STATIQUE dans `public/`, servi à la racine de l'origine : il obtient
 * le scope `/` sans en-tête `Service-Worker-Allowed`. Le matcher du proxy exclut
 * déjà les `.js`, il n'y a aucune whitelist à ajouter. Ses en-têtes (type MIME,
 * pas de cache) sont posés dans next.config.mjs.
 *
 * Écrit en JS sans build : ce fichier est servi TEL QUEL. Pas d'import, pas de
 * syntaxe qui aurait besoin d'être transpilée.
 */

/** Icônes du manifeste — les seules que le dépôt embarque. */
const ICON = "/web-app-manifest-192x192.png";

self.addEventListener("push", (event) => {
  // `userVisibleOnly: true` est le contrat de l'abonnement : un push qui
  // n'affiche RIEN fait perdre la permission au bout de quelques occurrences
  // (Chrome affiche alors une notification « ce site tourne en arrière-plan »).
  // D'où le repli : on montre toujours quelque chose, même si la charge utile
  // est illisible.
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch {
    data = {};
  }

  const title = data.title || "minddy";
  const options = {
    body: data.body || "",
    icon: ICON,
    badge: ICON,
    // Le `tag` est le chemin de destination : deux notifications sur le même
    // ticket se REMPLACENT au lieu d'empiler. `renotify: false` pour que le
    // remplacement soit silencieux — le téléphone ne resonne pas.
    tag: data.tag || "minddy",
    renotify: false,
    data: { url: data.url || "/inbox" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

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
      // Un onglet minddy déjà ouvert : on le remet au premier plan et on l'y
      // envoie, plutôt que d'ouvrir un deuxième onglet de la même app.
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ("navigate" in client) {
          try {
            await client.navigate(target);
          } catch {
            // Safari refuse `navigate()` dans certains cas : l'onglet est déjà
            // au premier plan, c'est le principal.
          }
        }
        return;
      }
      await self.clients.openWindow(target);
    })()
  );
});

/**
 * Le navigateur peut FAIRE TOURNER un abonnement tout seul (expiration côté
 * service de push, changement de clés). Sans ce handler, l'appareil cesse
 * silencieusement de recevoir quoi que ce soit, et sa ligne reste dans les
 * réglages en prétendant le contraire.
 *
 * La clé publique est allée chercher sur `/api/push/vapid` : un service worker
 * n'a pas accès aux variables inlinées dans le bundle client.
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
          }),
        });
      } catch (e) {
        console.error("[sw] ré-abonnement échoué:", e);
      }
    })()
  );
});

/** `applicationServerKey` veut des octets bruts ; VAPID se transporte en
 *  base64url. Recopié de lib/push/client.ts — un service worker n'importe pas. */
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = self.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
